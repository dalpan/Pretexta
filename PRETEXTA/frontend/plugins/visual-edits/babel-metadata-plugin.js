// babel-metadata-plugin.js
// Babel plugin for JSX transformation - adds metadata to all elements
const path = require("path");
const fs = require("fs");

// ───────────────────────────────────────────────────────────────────────────────
// ===== Dynamic composite detection (auto-exclude) =====
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const PROJECT_ROOT = path.resolve(__dirname, '../..'); // frontend root (../../ from plugins/visual-edits/)
const SRC_ALIAS = path.resolve(PROJECT_ROOT, "src");

const RESOLVE_CACHE = new Map(); // key: fromFile::source -> absPath | null
const FILE_AST_CACHE = new Map(); // absPath -> { ast, mtimeMs }
const PORTAL_COMP_CACHE = new Map(); // key: absPath::exportName -> boolean
const DYNAMIC_COMP_CACHE = new Map(); // key: absPath::exportName -> boolean
const BINDING_DYNAMIC_CACHE = new WeakMap(); // node -> boolean

function resolveImportPath(source, fromFile) {
  const cacheKey = `${fromFile}::${source}`;
  if (RESOLVE_CACHE.has(cacheKey)) return RESOLVE_CACHE.get(cacheKey);

  let base;
  if (source.startsWith("@/")) {
    base = path.join(SRC_ALIAS, source.slice(2));
  } else if (source.startsWith("./") || source.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), source);
  } else {
    // bare specifier (node_modules) — skip analysis
    RESOLVE_CACHE.set(cacheKey, null);
    return null;
  }

  // try direct file
  for (const ext of EXTENSIONS) {
    const file = base.endsWith(ext) ? base : base + ext;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      RESOLVE_CACHE.set(cacheKey, file);
      return file;
    }
  }
  // try index.* in directory
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const idx = path.join(base, "index" + ext);
      if (fs.existsSync(idx)) {
        RESOLVE_CACHE.set(cacheKey, idx);
        return idx;
      }
    }
  }

  RESOLVE_CACHE.set(cacheKey, null);
  return null;
}

function parseFileAst(absPath, parser) {
  try {
    const stat = fs.statSync(absPath);
    const cached = FILE_AST_CACHE.get(absPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.ast;

    const code = fs.readFileSync(absPath, "utf8");
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    FILE_AST_CACHE.set(absPath, { ast, mtimeMs: stat.mtimeMs });
    return ast;
  } catch (error) {
    return null;
  }
}

function jsxNameOf(openingEl, t) {
  const n = openingEl?.name;
  if (t.isJSXIdentifier(n)) return n.name;
  if (t.isJSXMemberExpression(n)) return n.property.name; // <X.Y>
  return null;
}

const PORTAL_SUFFIX_RE =
  /(Trigger|Portal|Content|Overlay|Viewport|Anchor|Arrow)$/;

function isPortalishName(name, RADIX_ROOTS) {
  if (!name) return false;
  return RADIX_ROOTS.has(name) || PORTAL_SUFFIX_RE.test(name);
}

// Analyze a specific exported component in a file
function fileExportHasPortals({
  absPath,
  exportName, // string or "default"
  t,
  traverse,
  parser,
  RADIX_ROOTS,
  depth = 0,
  maxDepth = 3,
}) {
  if (!absPath || depth > maxDepth) return false;
  const cacheKey = `${absPath}::${exportName}`;
  if (PORTAL_COMP_CACHE.has(cacheKey)) return PORTAL_COMP_CACHE.get(cacheKey);

  const ast = parseFileAst(absPath, parser);
  if (!ast) {
    PORTAL_COMP_CACHE.set(cacheKey, false);
    return false;
  }

  // Map local imports -> file paths for recursive checks
  const importMap = new Map(); // localName -> { absPath, importName }
  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      const target = resolveImportPath(src, absPath);
      if (!target) return;
      p.node.specifiers.forEach((s) => {
        if (t.isImportSpecifier(s)) {
          importMap.set(s.local.name, {
            absPath: target,
            importName: s.imported.name,
          });
        } else if (t.isImportDefaultSpecifier(s)) {
          importMap.set(s.local.name, {
            absPath: target,
            importName: "default",
          });
        }
      });
    },
  });

  // Find the component declaration for exportName
  let compPaths = [];

  traverse(ast, {
    ExportDefaultDeclaration(p) {
      if (exportName !== "default") return;
      const decl = p.node.declaration;
      if (
        t.isFunctionDeclaration(decl) ||
        t.isArrowFunctionExpression(decl) ||
        t.isFunctionExpression(decl)
      ) {
        compPaths.push(p.get("declaration"));
      } else if (t.isIdentifier(decl)) {
        const bind = p.scope.getBinding(decl.name);
        if (bind) compPaths.push(bind.path);
      }
    },
    ExportNamedDeclaration(p) {
      if (exportName === "default") return;
      if (p.node.declaration) {
        const d = p.node.declaration;
        if (t.isFunctionDeclaration(d) && d.id?.name === exportName) {
          compPaths.push(p.get("declaration"));
        }
        if (t.isVariableDeclaration(d)) {
          d.declarations.forEach((vd, i) => {
            if (t.isIdentifier(vd.id) && vd.id.name === exportName) {
              compPaths.push(p.get(`declaration.declarations.${i}.init`));
            }
          });
        }
      } else {
        p.node.specifiers.forEach((s) => {
          if (
            t.isExportSpecifier(s) &&
            t.isIdentifier(s.exported) &&
            s.exported.name === exportName &&
            t.isIdentifier(s.local)
          ) {
            const bind = p.scope.getBinding(s.local.name);
            if (bind) compPaths.push(bind.path);
          }
        });
      }
    },
  });

  if (compPaths.length === 0) {
    PORTAL_COMP_CACHE.set(cacheKey, false);
    return false;
  }

  let found = false;

  function subtreeHasPortals(nodePath) {
    let hit = false;
    nodePath.traverse({
      JSXOpeningElement(op) {
        if (hit) return;
        const name = jsxNameOf(op.node, t);
        if (isPortalishName(name, RADIX_ROOTS)) {
          hit = true;
          return;
        }
        if (/^[A-Z]/.test(name || "")) {
          // capitalized child: may itself be portalish
          const binding = op.scope.getBinding(name);
          if (binding && binding.path) {
            const childHas = subtreeHasPortals(binding.path);
            if (childHas) {
              hit = true;
              return;
            }
          } else if (importMap.has(name)) {
            const { absPath: childPath, importName } = importMap.get(name);
            const childHas = fileExportHasPortals({
              absPath: childPath,
              exportName: importName,
              t,
              traverse,
              parser,
              RADIX_ROOTS,
              depth: depth + 1,
            });
            if (childHas) {
              hit = true;
              return;
            }
          }
        }
      },
    });
    return hit;
  }

  for (const pth of compPaths) {
    if (!pth || !pth.node) continue;
    if (subtreeHasPortals(pth)) {
      found = true;
      break;
    }
  }

  PORTAL_COMP_CACHE.set(cacheKey, found);
  return found;
}

// Decide at a usage site whether <ElementName /> is a composite that should be excluded
function usageIsCompositePortal({
  elementName,
  jsxPath,
  state,
  t,
  traverse,
  parser,
  RADIX_ROOTS,
}) {
  // Same-file binding?
  const binding = jsxPath.scope.getBinding(elementName);
  if (binding && binding.path) {
    // Analyze the definition directly
    let hit = false;
    binding.path.traverse({
      JSXOpeningElement(op) {
        if (hit) return;
        const name = jsxNameOf(op.node, t);
        if (isPortalishName(name, RADIX_ROOTS)) {
          hit = true;
          return;
        }
        if (/^[A-Z]/.test(name || "")) {
          const innerBinding = op.scope.getBinding(name);
          if (innerBinding && innerBinding.path) {
            innerBinding.path.traverse(this.visitors);
          }
        }
      },
    });
    if (hit) return true;
  }

  // Imported binding (named)
  if (binding && binding.path && binding.path.isImportSpecifier()) {
    const from = binding.path.parent.source.value;
    const fileFrom =
      state.filename ||
      state.file?.opts?.filename ||
      state.file?.sourceFileName ||
      __filename;
    const absPath = resolveImportPath(from, fileFrom);
    if (!absPath) return false;
    const exportName = binding.path.node.imported.name;
    return fileExportHasPortals({
      absPath,
      exportName,
      t,
      traverse,
      parser,
      RADIX_ROOTS,
    });
  }

  // Imported binding (default)
  if (binding && binding.path && binding.path.isImportDefaultSpecifier()) {
    const from = binding.path.parent.source.value;
    const fileFrom =
      state.filename ||
      state.file?.opts?.filename ||
      state.file?.sourceFileName ||
      __filename;
    const absPath = resolveImportPath(from, fileFrom);
    if (!absPath) return false;
    return fileExportHasPortals({
      absPath,
      exportName: "default",
      t,
      traverse,
      parser,
      RADIX_ROOTS,
    });
  }

  return false;
}

// ───────────────────────────────────────────────────────────────────────────────
// Babel plugin for JSX transformation - adds metadata to all elements
const babelMetadataPlugin = ({ types: t }) => {
  const fileNameCache = new Map();
  const processedNodes = new WeakSet(); // Track processed nodes to prevent infinite loops

  const ARRAY_METHODS = new Set([
    "map",
    "forEach",
    "filter",
    "reduce",
    "reduceRight",
    "flatMap",
    "find",
    "findIndex",
    "some",
    "every",
  ]);

  // ---------- helpers ----------
  const getName = (openingEl) => {
    const n = openingEl?.name;
    return t.isJSXIdentifier(n) ? n.name : null;
  };

  const hasProp = (openingEl, name) =>
    openingEl?.attributes?.some(
      (a) =>
        t.isJSXAttribute(a) &&
        t.isJSXIdentifier(a.name) &&
        a.name.name === name,
    );

  const isPortalPrimitive = (name) =>
    /(Trigger|Portal|Content|Overlay|Viewport|Anchor|Arrow)$/.test(name);

  const RADIX_ROOTS = new Set([
    "Dialog",
    "Popover",
    "Tooltip",
    "DropdownMenu",
    "ContextMenu",
    "AlertDialog",
    "HoverCard",
    "Select",
    "Menubar",
    "NavigationMenu",
    "Sheet",
    "Drawer",
    "Toast",
    "Command",
  ]);

  // direct child of a Trigger / asChild / Slot parent?
  const isDirectChildOfAsChildOrTrigger = (jsxPath) => {
    const p = jsxPath.parentPath;
    if (!p || !p.isJSXElement || !p.isJSXElement()) return false;
    const open = p.node.openingElement;
    const name = getName(open) || "";
    return hasProp(open, "asChild") || /Trigger$/.test(name) || name === "Slot";
  };

  const alreadyHasXMeta = (openingEl) =>
    openingEl.attributes?.some(
      (a) =>
        t.isJSXAttribute(a) &&
        t.isJSXIdentifier(a.name) &&
        a.name.name.startsWith("x-"),
    );

  // ⬇️ Add { markExcluded } option: when true, include x-excluded="true"
  const insertMetaAttributes = (openingEl, attrsToAdd) => {
    if (!openingEl.attributes) openingEl.attributes = [];
    const spreadIndex = openingEl.attributes.findIndex((attr) =>
      t.isJSXSpreadAttribute(attr),
    );
    if (spreadIndex === -1) {
      openingEl.attributes.push(...attrsToAdd);
    } else {
      openingEl.attributes.splice(spreadIndex, 0, ...attrsToAdd);
    }
  };

  const pushMetaAttrs = (
    openingEl,
    { normalizedPath, lineNumber, elementName, isDynamic },
    { markExcluded = false } = {},
  ) => {
    if (alreadyHasXMeta(openingEl)) return;
    const metaAttrs = [
      t.jsxAttribute(
        t.jsxIdentifier("x-file-name"),
        t.stringLiteral(normalizedPath),
      ),
      t.jsxAttribute(
        t.jsxIdentifier("x-line-number"),
        t.stringLiteral(String(lineNumber)),
      ),
      t.jsxAttribute(
        t.jsxIdentifier("x-component"),
        t.stringLiteral(elementName),
      ),
      t.jsxAttribute(
        t.jsxIdentifier("x-id"),
        t.stringLiteral(`${normalizedPath}_${lineNumber}`),
      ),
      t.jsxAttribute(
        t.jsxIdentifier("x-dynamic"),
        t.stringLiteral(isDynamic ? "true" : "false"),
      ),
    ];
    if (markExcluded) {
      metaAttrs.push(
        t.jsxAttribute(t.jsxIdentifier("x-excluded"), t.stringLiteral("true")),
      );
    }
    insertMetaAttributes(openingEl, metaAttrs);
  };

  // Check if a JSX element is inside an array iteration callback
  function isJSXDynamic(jsxPath) {
    let currentPath = jsxPath.parentPath;
    while (currentPath) {
      if (currentPath.isCallExpression()) {
        const { callee } = currentPath.node;
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
          if (ARRAY_METHODS.has(callee.property.name)) return true;
        }
      }
      currentPath = currentPath.parentPath;
    }
    return false;
  }

  // Check if JSX element has any expressions (data dependencies)
  function hasAnyExpression(jsxElement) {
    const openingEl = jsxElement.openingElement;
    if (openingEl?.attributes?.some((attr) => t.isJSXSpreadAttribute(attr))) {
      return true;
    }
    for (const child of jsxElement.children) {
      if (
        t.isJSXExpressionContainer(child) &&
        !t.isJSXEmptyExpression(child.expression)
      ) {
        return true;
      }
      if (t.isJSXSpreadChild(child)) {
        return true;
      }
    }
    return false;
  }

  // bring in parser/traverse for dynamic analysis
  const parser = require("@babel/parser");
  const traverse = require("@babel/traverse").default;

  function pathHasDynamicJSX(targetPath) {
    if (!targetPath || !targetPath.node) return false;
    let dynamic = false;
    targetPath.traverse({
      JSXExpressionContainer(p) {
        if (dynamic) return;
        if (!t.isJSXEmptyExpression(p.node.expression)) {
          dynamic = true;
          p.stop();
        }
      },
      JSXSpreadAttribute(p) {
        if (dynamic) return;
        dynamic = true;
        p.stop();
      },
      JSXSpreadChild(p) {
        if (dynamic) return;
        dynamic = true;
        p.stop();
      },
    });
    return dynamic;
  }

  function pathIsDynamicComponent(path, visited = new WeakSet()) {
    if (!path || !path.node) return false;
    if (visited.has(path.node)) return false;
    visited.add(path.node);

    if (
      path.isFunctionDeclaration() ||
      path.isFunctionExpression() ||
      path.isArrowFunctionExpression()
    ) {
      return pathHasDynamicJSX(path);
    }

    if (path.isVariableDeclarator()) {
      const init = path.get("init");
      return init && init.node ? pathIsDynamicComponent(init, visited) : false;
    }

    if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (binding) {
        return pathIsDynamicComponent(binding.path, visited);
      }
      return false;
    }

    if (path.isCallExpression()) {
      const args = path.get("arguments") || [];
      if (args.length === 0) {
        return true;
      }
      for (const arg of args) {
        if (pathIsDynamicComponent(arg, visited)) {
          return true;
        }
      }
      return false;
    }

    if (path.isReturnStatement()) {
      const argument = path.get("argument");
      return argument && argument.node
        ? pathIsDynamicComponent(argument, visited)
        : false;
    }

    if (path.isExpressionStatement()) {
      const expr = path.get("expression");
      return expr && expr.node ? pathIsDynamicComponent(expr, visited) : false;
    }

    if (path.isJSXElement() || path.isJSXFragment()) {
      return pathHasDynamicJSX(path);
    }

    if (path.isObjectExpression()) {
      return true;
    }

    return false;
  }

  function fileExportIsDynamic({ absPath, exportName }) {
    if (!absPath) return false;
    const cacheKey = `${absPath}::${exportName}`;
    if (DYNAMIC_COMP_CACHE.has(cacheKey)) {
      return DYNAMIC_COMP_CACHE.get(cacheKey);
    }

    const ast = parseFileAst(absPath, parser);
    if (!ast) {
      DYNAMIC_COMP_CACHE.set(cacheKey, false);
      return false;
    }

    let dynamic = false;
    const visited = new WeakSet();

    function evaluatePath(nodePath) {
      if (!nodePath || !nodePath.node || dynamic) return;
      if (visited.has(nodePath.node)) return;
      visited.add(nodePath.node);

      if (
        nodePath.isFunctionDeclaration() ||
        nodePath.isFunctionExpression() ||
        nodePath.isArrowFunctionExpression()
      ) {
        if (pathHasDynamicJSX(nodePath)) {
          dynamic = true;
        }
        return;
      }

      if (nodePath.isVariableDeclarator()) {
        evaluatePath(nodePath.get("init"));
        return;
      }

      if (nodePath.isIdentifier()) {
        const binding = nodePath.scope.getBinding(nodePath.node.name);
        if (binding) {
          evaluatePath(binding.path);
        }
        return;
      }

      if (nodePath.isCallExpression()) {
        const args = nodePath.get("arguments") || [];
        if (args.length === 0) {
          dynamic = true;
          return;
        }
        for (const arg of args) {
          evaluatePath(arg);
          if (dynamic) return;
        }
        return;
      }

      if (nodePath.isReturnStatement()) {
        evaluatePath(nodePath.get("argument"));
        return;
      }

      if (nodePath.isExpressionStatement()) {
        evaluatePath(nodePath.get("expression"));
        return;
      }

      if (nodePath.isJSXElement() || nodePath.isJSXFragment()) {
        if (pathHasDynamicJSX(nodePath)) {
          dynamic = true;
        }
        return;
      }

      if (nodePath.isObjectExpression()) {
        dynamic = true;
      }
    }

    traverse(ast, {
      ExportDefaultDeclaration(p) {
        if (dynamic || exportName !== "default") return;
        evaluatePath(p.get("declaration"));
      },
      ExportNamedDeclaration(p) {
        if (dynamic || exportName === "default") return;

        if (p.node.declaration) {
          const decl = p.node.declaration;
          if (t.isFunctionDeclaration(decl) && decl.id?.name === exportName) {
            evaluatePath(p.get("declaration"));
            return;
          }
          if (t.isVariableDeclaration(decl)) {
            decl.declarations.forEach((vd, i) => {
              if (t.isIdentifier(vd.id) && vd.id.name === exportName) {
                evaluatePath(p.get(`declaration.declarations.${i}`));
              }
            });
            return;
          }
        }

        p.node.specifiers.forEach((s) => {
          if (
            !t.isExportSpecifier(s) ||
            !t.isIdentifier(s.exported) ||
            s.exported.name !== exportName
          ) {
            return;
          }

          if (p.node.source) {
            const from = p.node.source.value;
            const resolved = resolveImportPath(from, absPath);
            if (resolved) {
              if (
                fileExportIsDynamic({
                  absPath: resolved,
                  exportName: t.isIdentifier(s.local)
                    ? s.local.name
                    : exportName,
                })
              ) {
                dynamic = true;
              }
            }
            return;
          }

          if (t.isIdentifier(s.local)) {
            const binding = p.scope.getBinding(s.local.name);
            if (binding) {
              evaluatePath(binding.path);
            }
          }
        });
      },
    });

    DYNAMIC_COMP_CACHE.set(cacheKey, dynamic);
    return dynamic;
  }

  function componentBindingIsDynamic({ binding, state }) {
    if (!binding || !binding.path) return false;
    const bindingPath = binding.path;

    if (BINDING_DYNAMIC_CACHE.has(bindingPath.node)) {
      return BINDING_DYNAMIC_CACHE.get(bindingPath.node);
    }

    let result = false;

    if (bindingPath.isImportSpecifier()) {
      const from = bindingPath.parent.source.value;
      const fileFrom =
        state.filename ||
        state.file?.opts?.filename ||
        state.file?.sourceFileName ||
        __filename;
      const absPath = resolveImportPath(from, fileFrom);
      const exportName = bindingPath.node.imported.name;
      result = !!absPath ? fileExportIsDynamic({ absPath, exportName }) : false;
      BINDING_DYNAMIC_CACHE.set(bindingPath.node, result);
      return result;
    }

    if (bindingPath.isImportDefaultSpecifier()) {
      const from = bindingPath.parent.source.value;
      const fileFrom =
        state.filename ||
        state.file?.opts?.filename ||
        state.file?.sourceFileName ||
        __filename;
      const absPath = resolveImportPath(from, fileFrom);
      result = !!absPath
        ? fileExportIsDynamic({ absPath, exportName: "default" })
        : false;
      BINDING_DYNAMIC_CACHE.set(bindingPath.node, result);
      return result;
    }

    if (bindingPath.isImportNamespaceSpecifier()) {
      BINDING_DYNAMIC_CACHE.set(bindingPath.node, false);
      return false;
    }

    result = pathIsDynamicComponent(bindingPath);
    BINDING_DYNAMIC_CACHE.set(bindingPath.node, result);
    return result;
  }

  return {
    name: "element-metadata-plugin",
    visitor: {
      // Wrap React components (capitalized JSX) with metadata divs,
      // or stamp attributes when wrapping would break Radix/Floating-UI.
      JSXElement(jsxPath, state) {
        if (processedNodes.has(jsxPath.node)) return;

        const openingElement = jsxPath.node.openingElement;
        if (!openingElement?.name) return;
        const elementName = getName(openingElement);
        if (!elementName) return;

        // Only process capitalized components (React components)
        if (!/^[A-Z]/.test(elementName)) return;

        // Exclude components that have strict child requirements or break when wrapped
        const excludedComponents = new Set([
          "Route",
          "Routes",
          "Switch",
          "Redirect",
          "Navigate", // React Router
          "Fragment",
          "Suspense",
          "StrictMode", // React built-ins
          "ErrorBoundary",
          "Provider",
          "Consumer",
          "Outlet",
          "Link",
          "NavLink",
          // Portal-based primitives/triggers (Radix/Floating-UI)
          "Sheet",
          "SheetContent",
          "SheetOverlay",
          "SheetPortal",
          "Popover",
          "PopoverContent",
          "Tooltip",
          "TooltipContent",
          "DropdownMenu",
          "DropdownMenuContent",
          "DropdownMenuSubContent",
          "ContextMenu",
          "ContextMenuContent",
          "ContextMenuSubContent",
          "HoverCard",
          "HoverCardContent",
          "Select",
          "SelectContent",
          "Menubar",
          "MenubarContent",
          "MenubarSubContent",
          "MenubarPortal",
          "Drawer",
          "DrawerContent",
          "DrawerOverlay",
          "DrawerPortal",
          "Toast",
          "ToastViewport",
          "NavigationMenu",
          "NavigationMenuContent",
          "DropdownMenuPortal",
          "ContextMenuPortal",
          "Command",
          "CommandDialog",
          // Triggers & measured bits
          "PopoverTrigger",
          "TooltipTrigger",
          "DropdownMenuTrigger",
          "ContextMenuTrigger",
          "HoverCardTrigger",
          "SelectTrigger",
          "MenubarTrigger",
          "NavigationMenuTrigger",
          "SheetTrigger",
          "DrawerTrigger",
          "CommandInput",
          "Slot",
          // icons (avoid wrapping)
          "X",
          "ChevronRight",
          "ChevronLeft",
          "ChevronUp",
          "ChevronDown",
          "Check",
          "Plus",
          "Minus",
          "Search",
          "Menu",
          "Settings",
          "User",
          "Home",
          "ArrowRight",
          "ArrowLeft",
        ]);
        if (excludedComponents.has(elementName)) return;

        // Check if parent is a component that strictly validates children
        const parent = jsxPath.parentPath;
        if (parent?.isJSXElement?.()) {
          const parentName = getName(parent.node.openingElement) || "";
          if (
            [
              "Routes",
              "Switch",
              "BrowserRouter",
              "Router",
              "MemoryRouter",
              "HashRouter",
            ].includes(parentName) ||
            RADIX_ROOTS.has(parentName)
          ) {
            // Don't wrap if direct child of strict parent (e.g., Route inside Routes, or Radix roots)
            return;
          }
        }

        // Get source location
        const filename =
          state.filename ||
          state.file?.opts?.filename ||
          state.file?.sourceFileName ||
          "unknown";
        const lineNumber = openingElement.loc?.start.line || 0;

        if (!fileNameCache.has(filename)) {
          const base = path.basename(filename).replace(/\.[jt]sx?$/, "");
          fileNameCache.set(filename, base);
        }
        const normalizedPath = fileNameCache.get(filename) || "unknown";

        // Detect dynamic
        let isDynamic = isJSXDynamic(jsxPath) || hasAnyExpression(jsxPath.node);

        if (!isDynamic) {
          const binding = jsxPath.scope.getBinding(elementName);
          if (binding) {
            isDynamic = componentBindingIsDynamic({ binding, state });
          }
        }

        // Check if parent is a detected composite portal
        const parentIsCompositePortal = (() => {
          const p = jsxPath.parentPath;
          if (!p || !p.isJSXElement || !p.isJSXElement()) return false;
          const parentName = getName(p.node.openingElement);
          if (!parentName || !/^[A-Z]/.test(parentName)) return false;

          // Check if parent was detected as composite portal
          return usageIsCompositePortal({
            elementName: parentName,
            jsxPath: p,
            state,
            t,
            traverse,
            parser,
            RADIX_ROOTS,
          });
        })();

        // 🚫 If this element is a direct child of a Trigger/asChild/Slot,
        // or itself a primitive/root, DO NOT WRAP — stamp x-* on the element itself
        // and mark it with x-excluded="true".
        if (
          hasProp(openingElement, "asChild") ||
          isPortalPrimitive(elementName) ||
          RADIX_ROOTS.has(elementName) ||
          isDirectChildOfAsChildOrTrigger(jsxPath) ||
          parentIsCompositePortal
        ) {
          pushMetaAttrs(
            openingElement,
            { normalizedPath, lineNumber, elementName, isDynamic },
            { markExcluded: true },
          );
          return;
        }

        // NEW: dynamic composite detection (e.g., DemoPopover renders Popover primitives)
        const compositePortal = usageIsCompositePortal({
          elementName,
          jsxPath,
          state,
          t,
          traverse,
          parser,
          RADIX_ROOTS,
        });

        if (compositePortal) {
          // Treat like a primitive/root: don't wrap; stamp + mark excluded
          pushMetaAttrs(
            openingElement,
            { normalizedPath, lineNumber, elementName, isDynamic },
            { markExcluded: true },
          );
          return;
        }

        // ✅ Normal case: wrap with display: contents and preserve an existing key
        processedNodes.add(jsxPath.node);

        const keyAttr = openingElement.attributes?.find(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            a.name.name === "key",
        );

        const wrapperAttrs = [
          t.jsxAttribute(
            t.jsxIdentifier("x-file-name"),
            t.stringLiteral(normalizedPath),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-line-number"),
            t.stringLiteral(String(lineNumber)),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-component"),
            t.stringLiteral(elementName),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-id"),
            t.stringLiteral(`${normalizedPath}_${lineNumber}`),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-dynamic"),
            t.stringLiteral(isDynamic ? "true" : "false"),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("data-debug-wrapper"),
            t.stringLiteral("true"),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("style"),
            t.jsxExpressionContainer(
              t.objectExpression([
                t.objectProperty(
                  t.identifier("display"),
                  t.stringLiteral("contents"),
                ),
              ]),
            ),
          ),
        ];
        if (keyAttr?.value) {
          wrapperAttrs.push(
            t.jsxAttribute(t.jsxIdentifier("key"), t.cloneNode(keyAttr.value)),
          );
        }

        const wrapper = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("div"), wrapperAttrs, false),
          t.jsxClosingElement(t.jsxIdentifier("div")),
          [jsxPath.node],
          false,
        );

        jsxPath.replaceWith(wrapper);
      },

      // Add metadata to native HTML elements (lowercase JSX)
      JSXOpeningElement(jsxPath, state) {
        if (!jsxPath.node.name || !jsxPath.node.name.name) {
          return;
        }

        const elementName = jsxPath.node.name.name;

        // Skip fragments
        if (elementName === "Fragment") {
          return;
        }

        // Only process lowercase (native HTML)
        if (/^[A-Z]/.test(elementName)) {
          return;
        }

        // Skip if already has metadata
        const hasDebugAttr = jsxPath.node.attributes.some(
          (attr) =>
            t.isJSXAttribute(attr) &&
            attr.name &&
            attr.name.name &&
            attr.name.name.startsWith("x-"),
        );
        if (hasDebugAttr) return;

        // Get source location
        const filename =
          state.filename ||
          state.file?.opts?.filename ||
          state.file?.sourceFileName ||
          "unknown";

        const lineNumber = jsxPath.node.loc?.start.line || 0;

        if (!fileNameCache.has(filename)) {
          const base = path.basename(filename).replace(/\.[jt]sx?$/, "");
          fileNameCache.set(filename, base);
        }
        const normalizedPath = fileNameCache.get(filename) || "unknown";

        // Detect if native element is inside an array iteration or has expressions
        const parentJSXElement = jsxPath.findParent((p) => p.isJSXElement());
        const isDynamic = parentJSXElement
          ? isJSXDynamic(parentJSXElement) ||
            hasAnyExpression(parentJSXElement.node)
          : false;

        // Add metadata attributes
        insertMetaAttributes(jsxPath.node, [
          t.jsxAttribute(
            t.jsxIdentifier("x-file-name"),
            t.stringLiteral(normalizedPath),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-line-number"),
            t.stringLiteral(String(lineNumber)),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-component"),
            t.stringLiteral(elementName),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-id"),
            t.stringLiteral(`${normalizedPath}_${lineNumber}`),
          ),
          t.jsxAttribute(
            t.jsxIdentifier("x-dynamic"),
            t.stringLiteral(isDynamic ? "true" : "false"),
          ),
        ]);
      },
    },
  };
};

module.exports = babelMetadataPlugin;
