<div align="center">

# PRETEXTA
### The Psychology Behind Successful Attacks

![Version](https://img.shields.io/badge/Version-2.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Stack](https://img.shields.io/badge/Stack-React_|_FastAPI_|_LangChain-blueviolet)
![Status](https://img.shields.io/badge/Status-OPERATIONAL-brightgreen)

[Installation](#-quick-start) • [Features](#-features) • [Contributions](#-contributions)

</div>

---

## About

Pretexta is a social engineering simulation lab designed to help security professionals, educators, and organizations understand **why social engineering attacks succeed**.

Rather than teaching how to exploit people, Pretexta focuses on **pretexting, cognitive bias, and trust manipulation**, allowing participants to experience realistic scenarios within a controlled and responsible environment.

**Key Difference:** Unlike standard phishing simulators that just send emails, Pretexta engages users in **real-time, interactive conversations** with AI-driven threat actors, providing a safe sandbox to experience the pressure of a targeted attack.

> **DISCLAIMER**: THIS TOOL IS FOR AUTHORIZED SECURITY TESTING AND TRAINING ONLY. 
> ANY UNAUTHORIZED USE AGAINST REAL TARGETS IS STRICTLY PROHIBITED.

---

## ✨ Features

- **🗣️ Real-Time AI Chat**: Interact with dynamic AI personas (e.g., "The Urgent CEO", "Angry IT Support") powered by **Groq (Llama 3)**, Gemini, or Claude.
- **🧠 Adaptive Psychology**: Scenarios are built on Cialdini's 6 Principles of Influence (Reciprocity, Scarcity, Authority, etc.).
- **⚡ Interactive AI Lab**: A WhatsApp-style chat interface where you must defend against active pretexting attempts.
- **📊 Win/Loss Detection**: The AI automatically detects if you've been compromised (shared credentials, clicked links) or successfully defended the asset.
- **📝 Mission Logs**: Detailed history of your simulations with scoring and analysis.
- **🛡️ Quiz Mode**: Assess your theoretical knowledge of social engineering tactics.
- **🌐 Bilingual Support**: Full support for English and Indonesian (Bahasa Indonesia).

---

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/dalpan/Pretexta.git
cd Pretexta

# Build and Start
make build
make up

# Seed Initial Data
make seed

# Access the Lab
# Frontend: http://localhost:3000
# Backend: http://localhost:8001
# Login: soceng / Cialdini@2025!
```

### LLM Configuration (Required)

To use the AI Chat features, you need an API key. We recommend **Groq** for the best speed/free-tier experience.

1.  **Get a Key**:
    *   **Groq**: [console.groq.com](https://console.groq.com) (Recommended)
    *   **Google Gemini**: [aistudio.google.com](https://aistudio.google.com)
    *   **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
2.  **Configure**:
    *   Go to `Settings` in the Pretexta Dashboard.
    *   Select your provider (e.g., Groq).
    *   Paste your API Key and click **Save**.

---

## Tech Stack

*   **Frontend**: React 18, Tailwind CSS, Lucide Icons, Axios
*   **Backend**: Python FastAPI, LangChain, Motor (MongoDB Async)
*   **AI/LLM**: LangChain integration with Groq (Llama 3), Gemini Pro, Claude Sonnet
*   **Database**: MongoDB

---

## Contributions

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to add new scenarios, quizzes, or features.

### Adding a New Scenario
You can add new scenarios easily by creating a YAML file in `data/sample/`:

```yaml
type: ai_challenge
title: "The Fake Recruiter"
persona:
  name: "Sarah Jenkins"
  role: "Recruiter at TechCorp"
  goal: "Get user to open malicious resume PDF"
  style: "Professional, Friendly, slightly pushy"
```

Then run `make seed` to import it.

---

## License

This project is licensed under the MIT License.

<div align="center">

**Pretexta** - *The Psychology Behind Successful Attacks*

</div>
