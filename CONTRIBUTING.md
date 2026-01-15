# Contributing to Pretexta

Thank you for your interest in contributing! We welcome YAML-based scenarios and quizzes that help improve security awareness training.

## 🎯 What We're Looking For

- **Realistic** social engineering scenarios
- Coverage of all 6 Cialdini principles:
  - Authority
  - Scarcity
  - Reciprocity
  - Commitment & Consistency
  - Liking
  - Social Proof
- Diverse attack vectors: email, phone, chat, web
- Bilingual content (EN/ID preferred)
- Well-documented decision trees

## 📝 YAML Guidelines

### File Naming

```
YYYY-MM-DD-brief-description-slug.yaml
```

Examples:
- `2025-01-15-ceo-fraud-wire-transfer.yaml`
- `2025-01-16-it-support-password-reset.yaml`

### Challenge Template

See `templates/challenge_template.yaml`

```yaml
type: challenge
title: "Your Challenge Title"
description: "Brief description for users"
difficulty: easy|medium|hard
cialdini_categories: [authority, scarcity]
estimated_time: 10  # minutes
metadata:
  author: "Your Name"
  license: "MIT"
  tags: [phishing, email, corporate]

nodes:
  - id: start
    type: message
    channel: email_inbox
    content_en:
      subject: "Email subject"
      from: "sender@example.com"
      body: "Email body"
    content_id:  # Optional Indonesian
      subject: "Subjek email"
      from: "pengirim@example.com"
      body: "Isi email"
    next: choice_1

  - id: choice_1
    type: question
    content_en:
      text: "What do you do?"
    options:
      - text: "Click the link"
        next: bad_outcome
        score_impact: -15
      - text: "Verify first"
        next: good_outcome
        score_impact: +10

  - id: bad_outcome
    type: end
    result: failure
    content_en:
      title: "Compromised!"
      explanation: "Clicking unverified links can lead to credential theft."

  - id: good_outcome
    type: end
    result: success
    content_en:
      title: "Well done!"
      explanation: "Always verify requests through known channels."
```

### Quiz Template

See `templates/quiz_template.yaml`

```yaml
type: quiz
title: "Quiz Title"
description: "Brief description"
difficulty: easy|medium|hard
cialdini_categories: 
  - authority

metadata:
  author: "Pretexta"
  tags: [phishing, email, basics]

questions:
  - id: q1
    content_en:
      text: "Question text?"
      explanation: "Why this answer matters"
    options:
      - text: "Option A"
        correct: true
      - text: "Option B"
        correct: false
    points: 10
```

## ✅ Validation

Before submitting:

```bash
python bin/validate_yaml.py your_file.yaml
```

## 🔄 Pull Request Process

1. **Fork** the repository
2. **Create** a branch: `git checkout -b add-scenario-name`
3. **Add** your YAML to `data/sample/`
4. **Validate** using the CLI tool
5. **Commit**: `git commit -m "Add: CEO fraud scenario"`
6. **Push**: `git push origin add-scenario-name`
7. **Submit** a Pull Request

### PR Guidelines

- **One YAML per PR** (easier to review)
- Include brief description of scenario
- Test locally before submitting
- Follow existing naming conventions
- Add yourself to metadata author field

## 🚫 What Not to Submit

- Scenarios targeting real individuals or organizations
- Content promoting illegal activities
- Scenarios that could cause harm if misused
- Malicious payloads or actual exploits
- Low-quality or joke submissions

## 📚 Resources

- [Cialdini's 6 Principles](https://en.wikipedia.org/wiki/Robert_Cialdini#6_key_principles_of_influence_by_Robert_Cialdini)
- [Social Engineering Attacks](https://www.social-engineer.org/framework/attack-vectors/)
- [YAML Syntax](https://yaml.org/spec/1.2.2/)

## 🤝 Code of Conduct

- Be respectful and professional
- Focus on security awareness education
- No discrimination or harassment
- Constructive feedback only

## ❔ Questions?

Open an issue or reach out to the maintainers.

---

**Thank you for helping make security awareness training more effective!**
