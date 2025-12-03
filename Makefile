# SocengLab Makefile

.PHONY: help install build up down restart logs clean test seed

# Default target
help:
	@echo "SocengLab - Makefile Commands"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       - Install dependencies (run first time)"
	@echo "  make build         - Build Docker images"
	@echo "  make up            - Start all services"
	@echo "  make down          - Stop all services"
	@echo "  make restart       - Restart all services"
	@echo ""
	@echo "Database:"
	@echo "  make seed          - Import sample challenges and quizzes"
	@echo "  make db-shell      - Open MongoDB shell"
	@echo "  make drop          - Delete sample challenges and quizzes"
	@echo ""
	@echo "Development:"
	@echo "  make logs          - Show logs from all services"
	@echo "  make logs-backend  - Show backend logs only"
	@echo "  make logs-frontend - Show frontend logs only"
	@echo "  make test          - Run tests"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Remove containers and volumes"
	@echo "  make clean-all     - Remove everything including images"


install:
	@echo "Installing dependencies..."
	@cd frontend && yarn install
	@cd backend && pip install -r requirements.txt
	@echo "✅ Dependencies installed"

build:
	@echo "Building Docker images..."
	@docker-compose build
	@echo "✅ Docker images built"

up:
	@echo "Starting Soceng Lab..."
	@docker-compose up -d
	@echo "⏳ Waiting for services to start..."
	@sleep 10
	@echo ""
	@echo "✅ Soceng Lab is running!"
	@echo ""
	@echo "🌐 Frontend: http://localhost:3000"
	@echo "🔌 Backend API: http://localhost:8001"
	@echo "🗄️  MongoDB: mongodb://localhost:27017"
	@echo ""
	@echo "📝 Default credentials: soceng / Cialdini@2025!"
	@echo ""
	@echo "Run 'make seed' to import sample content"

down:
	@echo "Stopping Soceng Lab..."
	@docker-compose down
	@echo "✅ Services stopped"

restart:
	@echo "Restarting Soceng Lab..."
	@docker-compose restart
	@echo "✅ Services restarted"

logs:
	@docker-compose logs -f

logs-backend:
	@docker-compose logs -f backend

logs-frontend:
	@docker-compose logs -f frontend

db-shell:
	@docker-compose exec mongodb mongosh -u soceng_admin -p soceng_secure_password_2025 --authenticationDatabase admin soceng_lab

seed:
	@echo "Importing sample challenges and quizzes..."
	@docker-compose exec backend python /app/scripts/import_yaml.py /app/data/sample
	@echo "✅ Sample content imported"

test:
	@echo "Running tests..."
	@cd backend && pytest
	@cd frontend && yarn test --watchAll=false
	@echo "✅ Tests completed"

clean:
	@echo "Cleaning up containers and volumes..."
	@docker-compose down -v
	@echo "✅ Cleaned"

clean-all:
	@echo "Removing everything..."
	@docker-compose down -v --rmi all
	@echo "✅ Everything removed"

drop:
	@echo "Delete sample challenges and quizzes..."
	@docker-compose exec backend python /app/scripts/drop_yaml.py
	@echo "✅ Sample content deleted"

validate-yaml:
	@echo "Validating a specific YAML file..."
	@if [ -z "$(FILE)" ]; then \
		echo "Please provide a YAML file to validate using 'make validate-yaml FILE=path/to/file.yaml'"; \
		exit 1; \
	fi
	@docker-compose exec backend python /app/scripts/validate_yaml.py $(FILE)
	@echo "✅ YAML file is valid"

validate-yaml-all:
	@echo "Validating all YAML files..."
	@docker-compose exec backend find /app/data/sample -name "*.yaml" -exec python /app/scripts/validate_yaml.py {} \;
	@echo "✅ All YAML files are valid"
