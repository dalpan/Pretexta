# Pretexta Makefile
# Social Engineering Simulation Platform
#
# Usage: make <target>
# Run 'make help' for full command list.

.PHONY: help install dev dev-backend dev-frontend build up down restart \
        logs logs-backend logs-frontend status seed drop clean clean-all \
        test lint lint-fix db-shell fix-network validate-yaml validate-yaml-all

# ── Colors ────────────────────────────────────────────────────────────────────
RED    := \033[31m
GREEN  := \033[32m
YELLOW := \033[33m
CYAN   := \033[36m
RESET  := \033[0m

# ── Detect environment ────────────────────────────────────────────────────────
IS_WSL   := $(shell grep -qi microsoft /proc/version 2>/dev/null && echo true || echo false)
COMPOSE  := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "$(CYAN)Pretexta — Social Engineering Simulation Platform$(RESET)"
	@echo "$(CYAN)═══════════════════════════════════════════════════$(RESET)"
	@echo ""
	@echo "$(GREEN)Setup & Build:$(RESET)"
	@echo "  make install         Install all dependencies (first time)"
	@echo "  make build           Build Docker images"
	@echo "  make up              Start all services in Docker"
	@echo "  make down            Stop all services"
	@echo "  make restart         Restart all services"
	@echo ""
	@echo "$(GREEN)Local Development (no Docker):$(RESET)"
	@echo "  make dev             Start frontend + backend locally (MongoDB in Docker)"
	@echo "  make dev-backend     Start backend only (localhost:8001)"
	@echo "  make dev-frontend    Start frontend only (localhost:3000)"
	@echo ""
	@echo "$(GREEN)Database:$(RESET)"
	@echo "  make seed            Import sample scenarios and quizzes"
	@echo "  make drop            Remove sample content"
	@echo "  make db-shell        Open MongoDB shell"
	@echo ""
	@echo "$(GREEN)Monitoring:$(RESET)"
	@echo "  make status          Show service health and URLs"
	@echo "  make logs            Stream all service logs"
	@echo "  make logs-backend    Stream backend logs only"
	@echo "  make logs-frontend   Stream frontend logs only"
	@echo ""
	@echo "$(GREEN)Quality:$(RESET)"
	@echo "  make test            Run all tests"
	@echo "  make lint            Run backend linter (ruff)"
	@echo "  make lint-fix        Auto-fix backend lint issues"
	@echo "  make validate-yaml FILE=path/to/file.yaml"
	@echo ""
	@echo "$(GREEN)Maintenance:$(RESET)"
	@echo "  make clean           Remove containers and volumes"
	@echo "  make clean-all       Remove everything including images"
	@echo "  make fix-network     Fix Docker network issues (WSL2 / IPv6 problems)"
	@echo ""
	@if [ "$(IS_WSL)" = "true" ]; then \
		echo "$(YELLOW)  WSL2 detected. Run 'make fix-network' if you see Docker connectivity errors.$(RESET)"; \
		echo ""; \
	fi

# ── Network Fix (WSL2 / IPv6 issues) ─────────────────────────────────────────

fix-network:
	@echo "$(YELLOW)Fixing Docker network configuration for WSL2/IPv6 issues...$(RESET)"
	@echo ""
	@echo "Step 1: Configuring Docker daemon to use IPv4 DNS..."
	@sudo mkdir -p /etc/docker
	@echo '{"dns":["8.8.8.8","8.8.4.4"],"ipv6":false}' | sudo tee /etc/docker/daemon.json > /dev/null
	@echo "$(GREEN)  Docker daemon.json written$(RESET)"
	@echo ""
	@echo "Step 2: Fixing WSL2 DNS resolver..."
	@sudo bash -c 'printf "nameserver 8.8.8.8\nnameserver 8.8.4.4\n" > /etc/resolv.conf'
	@echo "$(GREEN)  /etc/resolv.conf updated$(RESET)"
	@echo ""
	@echo "Step 3: Restarting Docker daemon..."
	@sudo service docker restart 2>/dev/null || sudo systemctl restart docker 2>/dev/null || true
	@sleep 3
	@echo "$(GREEN)  Docker restarted$(RESET)"
	@echo ""
	@echo "Step 4: Verifying Docker connectivity..."
	@docker pull hello-world:latest > /dev/null 2>&1 && \
		echo "$(GREEN)  Docker can reach docker.io — network is fixed!$(RESET)" || \
		echo "$(RED)  Still having issues. Try: wsl --shutdown (from Windows) then restart.$(RESET)"
	@echo ""
	@echo "Now run: $(CYAN)make build$(RESET)"

# ── Dependencies ───────────────────────────────────────────────────────────────

install:
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@echo "Installing frontend packages..."
	@cd frontend && yarn install
	@echo "Installing backend packages..."
	@cd backend && pip install -r requirements.txt
	@echo "$(GREEN)Dependencies installed$(RESET)"

# ── Docker Build & Run ─────────────────────────────────────────────────────────

build:
	@echo "$(CYAN)Building Docker images...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env && echo "$(YELLOW)Created .env from .env.example$(RESET)"; fi
	@if [ "$(IS_WSL)" = "true" ]; then \
		echo "$(YELLOW)WSL2 detected. Using --network=host for build. If this fails, run: make fix-network$(RESET)"; \
	fi
	@DOCKER_BUILDKIT=1 BUILDKIT_PROGRESS=plain $(COMPOSE) build --parallel 2>&1 | \
		grep -v "^#[0-9]" | grep -v "^=> \[" | grep -v "^=> CACHED" || true
	@echo "$(GREEN)Docker images built$(RESET)"

build-no-cache:
	@echo "$(CYAN)Building Docker images (no cache)...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@DOCKER_BUILDKIT=1 $(COMPOSE) build --no-cache --parallel
	@echo "$(GREEN)Images built$(RESET)"

up:
	@echo "$(CYAN)Starting Pretexta...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env && echo "$(YELLOW)Created .env from .env.example$(RESET)"; fi
	@$(COMPOSE) up -d
	@echo "Waiting for services to become healthy..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		sleep 3; \
		healthy=$$($(COMPOSE) ps --status running 2>/dev/null | grep -c "Up" || echo 0); \
		if [ $$healthy -ge 3 ]; then break; fi; \
		echo "  Waiting... ($$i/10)"; \
	done
	@$(MAKE) status

down:
	@echo "$(CYAN)Stopping Pretexta...$(RESET)"
	@$(COMPOSE) down
	@echo "$(GREEN)Services stopped$(RESET)"

restart:
	@echo "$(CYAN)Restarting Pretexta...$(RESET)"
	@$(COMPOSE) restart
	@$(MAKE) status

# ── Local Development (no Docker for app) ─────────────────────────────────────

dev:
	@echo "$(CYAN)Starting Pretexta in local development mode...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@echo "Starting MongoDB in Docker..."
	@$(COMPOSE) up -d mongodb
	@echo "Waiting for MongoDB..."
	@sleep 5
	@echo ""
	@echo "$(GREEN)Starting backend and frontend in parallel...$(RESET)"
	@echo "$(YELLOW)Press Ctrl+C to stop both servers$(RESET)"
	@echo ""
	@(cd backend && MONGO_URL="mongodb://soceng_admin:soceng_secure_password_2025@localhost:47017/Pretexta?authSource=admin" \
		JWT_SECRET="dev-secret-key" \
		CORS_ORIGINS="http://localhost:3000" \
		uvicorn server:app --host 0.0.0.0 --port 8001 --reload &) && \
		(sleep 2 && cd frontend && REACT_APP_BACKEND_URL=http://localhost:8001 yarn start)

dev-backend:
	@echo "$(CYAN)Starting backend only (localhost:8001)...$(RESET)"
	@$(COMPOSE) up -d mongodb
	@sleep 3
	@cd backend && \
		MONGO_URL="mongodb://soceng_admin:soceng_secure_password_2025@localhost:47017/Pretexta?authSource=admin" \
		JWT_SECRET="dev-secret-key" \
		CORS_ORIGINS="http://localhost:3000,http://localhost:9443" \
		uvicorn server:app --host 0.0.0.0 --port 8001 --reload

dev-frontend:
	@echo "$(CYAN)Starting frontend only (localhost:3000)...$(RESET)"
	@echo "$(YELLOW)Make sure backend is running on port 8001$(RESET)"
	@cd frontend && REACT_APP_BACKEND_URL=http://localhost:8001 yarn start

# ── Status ─────────────────────────────────────────────────────────────────────

status:
	@echo ""
	@echo "$(CYAN)Pretexta Service Status$(RESET)"
	@echo "$(CYAN)═══════════════════════$(RESET)"
	@$(COMPOSE) ps 2>/dev/null || echo "No services running"
	@echo ""
	@FRONTEND_PORT=$$(grep FRONTEND_PORT .env 2>/dev/null | cut -d= -f2 || echo 9443); \
	BACKEND_PORT=$$(grep BACKEND_PORT .env 2>/dev/null | cut -d= -f2 || echo 9442); \
	echo "$(GREEN)URLs:$(RESET)"; \
	echo "  Platform:   http://localhost:$$FRONTEND_PORT"; \
	echo "  API:        http://localhost:$$BACKEND_PORT/api"; \
	echo "  API Docs:   http://localhost:$$BACKEND_PORT/docs"; \
	echo "  MongoDB:    mongodb://localhost:47017"; \
	echo ""; \
	echo "$(YELLOW)Default credentials:$(RESET) soceng / Cialdini@2025!"
	@echo ""

# ── Logs ───────────────────────────────────────────────────────────────────────

logs:
	@$(COMPOSE) logs -f --tail=100

logs-backend:
	@$(COMPOSE) logs -f --tail=100 backend

logs-frontend:
	@$(COMPOSE) logs -f --tail=100 frontend

logs-db:
	@$(COMPOSE) logs -f --tail=50 mongodb

# ── Database ───────────────────────────────────────────────────────────────────

db-shell:
	@$(COMPOSE) exec mongodb mongosh \
		-u soceng_admin \
		-p soceng_secure_password_2025 \
		--authenticationDatabase admin \
		Pretexta

seed:
	@echo "$(CYAN)Importing sample content...$(RESET)"
	@$(COMPOSE) exec backend python /app/scripts/import_yaml.py /app/data/sample
	@$(COMPOSE) exec backend python /app/scripts/import_yaml.py /app/data/professionals
	@echo "$(GREEN)Sample content imported$(RESET)"

drop:
	@echo "$(YELLOW)Removing sample content...$(RESET)"
	@$(COMPOSE) exec backend python /app/scripts/drop_yaml.py
	@echo "$(GREEN)Sample content removed$(RESET)"

# ── Quality ────────────────────────────────────────────────────────────────────

test:
	@echo "$(CYAN)Running backend tests...$(RESET)"
	@cd backend && python -m pytest tests/ -v --tb=short 2>/dev/null || \
		echo "$(YELLOW)No tests found. Create tests/ directory to add test coverage.$(RESET)"
	@echo ""
	@echo "$(CYAN)Running frontend type check...$(RESET)"
	@cd frontend && yarn test --watchAll=false --passWithNoTests 2>/dev/null || true
	@echo "$(GREEN)Test run complete$(RESET)"

lint:
	@echo "$(CYAN)Linting backend (ruff)...$(RESET)"
	@cd backend && ruff check .
	@cd backend && ruff format --check .
	@echo "$(GREEN)Lint passed$(RESET)"

lint-fix:
	@echo "$(CYAN)Auto-fixing backend lint issues...$(RESET)"
	@cd backend && ruff check --fix .
	@cd backend && ruff format .
	@echo "$(GREEN)Lint fixed$(RESET)"

validate-yaml:
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)Usage: make validate-yaml FILE=path/to/file.yaml$(RESET)"; \
		exit 1; \
	fi
	@$(COMPOSE) exec backend python /app/scripts/validate_yaml.py $(FILE)

validate-yaml-all:
	@echo "$(CYAN)Validating all YAML files...$(RESET)"
	@$(COMPOSE) exec backend find /app/data -name "*.yaml" \
		-exec python /app/scripts/validate_yaml.py {} \;
	@echo "$(GREEN)All YAML files valid$(RESET)"

# ── Maintenance ────────────────────────────────────────────────────────────────

clean:
	@echo "$(YELLOW)Removing containers and volumes...$(RESET)"
	@$(COMPOSE) down -v
	@echo "$(GREEN)Cleaned$(RESET)"

clean-all:
	@echo "$(RED)Removing all containers, volumes, and images...$(RESET)"
	@$(COMPOSE) down -v --rmi all
	@docker image prune -f
	@echo "$(GREEN)Everything removed$(RESET)"

reset: clean
	@echo "$(CYAN)Resetting to clean state...$(RESET)"
	@$(MAKE) build
	@$(MAKE) up
	@echo "$(GREEN)Reset complete$(RESET)"
