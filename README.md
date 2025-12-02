<div align="center">

# Soceng Lab - Adaptive Social Engineering Simulator

![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![React](https://img.shields.io/badge/React-18-blue)
![Status](https://img.shields.io/badge/Status-✓%20OPERATIONAL-brightgreen)

[Instalation](#-quick-start) • [Fitures](#-features) • [Contributions](#-contributions)

</div>

---
## 🎯 About

**SocEng Lab** is an open-source adaptive social engineering simulation platform that brings academic rigor to security awareness training. This AI-driven tool adapts attacks in real-time based on user responses like a "choose-your-own-adventure" experience powered by Cialdini's six principles of influence and threat actor playbooks. By mapping attack scenarios to Cialdini's principles and implementing persona-based adaptive branching, teams can measure and improve human resilience against social engineering at scale.

**THIS TOOL IS FOR AUTHORIZED SECURITY TESTING AND TRAINING ONLY**

- ✅ Use only with explicit written consent from all participants
- ✅ All simulations run locally - NO external messages sent
- ✅ Designed for controlled training environments
- ❌ DO NOT use against real targets without authorization
- ❌ Unauthorized use may violate laws (e.g., CFAA, GDPR, local anti-fraud laws)

By using this tool, you agree to use it ethically and legally. The developers assume no liability for misuse.

## ✨ Features

- **Adaptive Challenge Engine**: Node-based branching scenarios with dynamic escalation
- **Quiz Mode**: Multiple-choice assessments with instant feedback
- **LLM Integration**: Optional pretext generation (OpenAI, Gemini, Claude, generic)
- **Bilingual**: English and Indonesian (i18n ready)
- **Offline-First**: Works without network by default
- **Single User**: Seeded authentication, no registration
- **Scoring Engine**: 0-100 susceptibility score with Cialdini category breakdown

## 🚀 Quick Start

### Docker (Recommended)

```bash
# Clone
git clone https://github.com/dalpan/SocengLab.git
cd SocengLab

# Start
make build
make up
make seed

# Done! 
# Frontend: http://localhost:3000
# Backend: http://localhost:8001
# Login: soceng / Cialdini@2025!
```

## 📋 Makefile Commands

| Command                             | Description                                      |
| ----------------------------------- | ------------------------------------------------ |
| `make help`                         | Show all available commands                      |
| **Setup & Installation**            |                                                  |
| `make install`                      | Install backend + frontend dependencies          |
| `make build`                        | Build all Docker images                          |
| `make up`                           | Start all services (frontend, backend, database) |
| `make down`                         | Stop all running services                        |
| `make restart`                      | Restart all services                             |
| **Logs & Development**              |                                                  |
| `make logs`                         | Show logs from all services                      |
| `make logs-backend`                 | Show only backend logs                           |
| `make logs-frontend`                | Show only frontend logs                          |
| `make test`                         | Run backend & frontend tests                     |
| **Database Tools**                  |                                                  |
| `make seed`                         | Import sample challenges and quizzes             |
| `make drop`                         | Remove challenges & quizzes from database        |
| `make db-shell`                     | Open MongoDB shell                               |
| **Maintenance**                     |                                                  |
| `make clean`                        | Remove containers + volumes                      |
| `make clean-all`                    | Remove everything including images               |
| **YAML Validation**                 |                                                  |
| `make validate-yaml FILE=path.yaml` | Validate a single YAML file                      |
| `make validate-yaml-all`            | Validate all YAML files in `/data/sample`        |

---

### Manual

<details>
<summary>Expand manual installation</summary>

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend  
cd frontend
yarn install
yarn start

# Import samples
python bin/import_yaml.py data/sample/
```

</details>

---

## 🤝 Contributions

### Add Challenge

Make file `data/sample/your-challenge.yaml`:

```yaml
type: challenge
title: "Challenge Title"
difficulty: medium
cialdini_categories: [authority, urgency]
nodes:
  - id: start
    type: message
    channel: email_inbox
    content_en:
      subject: "..."
      body: "..."
    next: choice_1
```

[Detail template](templates/challenge_template.yaml)

### Add Quiz

```yaml
type: quiz
title: "Quiz Title"
difficulty: easy
questions:
  - id: q1
    content_en:
      text: "Question?"
    options:
      - text: "Answer A"
        correct: true
```

[Detail template](templates/quiz_template.yaml)

### Submit

```bash
python bin/validate_yaml.py your-file.yaml
# Submit PR to GitHub
```
Readmore for detail [Contribution](/CONTRIBUTING.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Dr. Robert Cialdini for foundational research on influence and persuasion
- The security research community for continuous innovation
- All contributors and testers

<div align="center">

**Made with ❤️ for security awareness**

[⭐ Star](https://github.com/dalpan/SocengLab) • [🐛 Issues](https://github.com/dalpan/SocengLab/issues) • [💡 Features](https://github.com/dalpan/SocengLab/issues)

**Remember**: With great power comes great responsibility. Use this tool ethically and legally. 🛡️
</div>

