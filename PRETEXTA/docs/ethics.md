# Ethical Guidelines for Pretexta

## 🎯 Purpose

Pretexta is designed exclusively for **authorized security awareness training**. This document outlines ethical requirements and prohibited uses.

## ✅ Permitted Uses

### 1. Corporate Security Training
- Employee awareness programs
- Onboarding security modules
- Quarterly refresher courses
- With explicit management approval

### 2. Red Team Assessment Preparation
- Internal team training
- Pre-engagement simulation
- Skill validation
- With documented authorization

### 3. Academic Research
- IRB-approved studies
- Informed consent from participants
- Anonymous data collection
- Published findings

### 4. Security Conferences & Workshops
- Hands-on training sessions
- Capture-the-flag style events
- Professional development
- With participant consent

## ❌ Prohibited Uses

### Absolutely Forbidden

1. **Unauthorized Testing**
   - Testing on individuals without consent
   - Testing on organizations without permission
   - "Practice" on family/friends without disclosure

2. **Malicious Purposes**
   - Actual credential harvesting
   - Real financial fraud
   - Identity theft
   - Harassment or coercion

3. **Real-World Exploitation**
   - Using generated pretexts for actual attacks
   - Targeting real organizations
   - Collecting real PII or credentials

## 📝 Consent Requirements

### Before ANY Simulation

1. **Participant Consent**
   - Clear explanation of training purpose
   - Voluntary participation
   - Right to withdraw at any time
   - Written or recorded consent

2. **Organizational Authorization**
   - Management approval
   - Legal/compliance review
   - Documented scope
   - Insurance coverage verification

3. **Data Handling Agreement**
   - What data is collected
   - How data will be used
   - Retention period
   - Deletion process

### Consent Modal (Built-in)

Pretexta includes a mandatory consent modal that:
- Displays before simulations
- Requires explicit acknowledgment
- Logs consent timestamp
- Provides opt-out mechanism

## 🔒 Data Protection

### What We Collect
- Simulation events (choices, timing)
- Susceptibility scores
- Participant names (optional)
- Timestamps

### What We DON'T Collect
- Real credentials
- Personal identifiable information (PII)
- Financial information
- Health data

### Data Handling
- **Encryption**: At rest and in transit
- **Retention**: Configurable, default 90 days
- **Deletion**: User-initiated or automatic
- **Export**: JSON format for audits

## 🛡️ Safety Features

### PII Sanitization
LLM-generated content automatically sanitizes:
- Email addresses → `[EMAIL_REDACTED]`
- Phone numbers → `[PHONE_REDACTED]`
- SSNs → `[SSN_REDACTED]`

### Rate Limiting
- LLM API calls limited per hour
- Prevents abuse
- Configurable per deployment

### Audit Trail
- All LLM generations logged
- User actions tracked
- Admin review available

## 📚 Ethical Framework

### Based on Belmont Report Principles

1. **Respect for Persons**
   - Informed consent
   - Voluntary participation
   - Protection of vulnerable populations

2. **Beneficence**
   - Maximize training benefits
   - Minimize psychological harm
   - Provide debriefing

3. **Justice**
   - Fair participant selection
   - No exploitation
   - Equitable distribution of benefits

## 🚨 Reporting Misuse

If you suspect misuse of Pretexta:

1. Document the incident
2. Report to your organization's security team
3. Open a GitHub issue (if public concern)
4. Contact project maintainers

## 👥 Responsible Disclosure

For security vulnerabilities in Pretexta itself:

1. **Do NOT** open a public issue
2. Email maintainers with details
3. Allow 90 days for patching
4. Coordinate disclosure timing

## ⚖️ Legal Considerations

### Compliance
- **GDPR**: Right to erasure, data portability
- **CCPA**: Opt-out mechanisms, data disclosure
- **Industry-specific**: HIPAA, PCI-DSS, SOC 2

### Liability
- Users responsible for lawful use
- No warranty for fitness of purpose
- Indemnification clauses apply

## 🎯 Training Best Practices

### Before Simulation
1. Establish training objectives
2. Obtain all necessary approvals
3. Brief participants on expectations
4. Set up safe environment

### During Simulation
1. Monitor participant stress levels
2. Provide support resources
3. Allow pause/quit options
4. Maintain confidentiality

### After Simulation
1. Conduct debriefing
2. Explain techniques used
3. Provide educational resources
4. Address concerns
5. Delete data as agreed

## 📜 References

- [The Belmont Report](https://www.hhs.gov/ohrp/regulations-and-policy/belmont-report/index.html)
- [ACM Code of Ethics](https://www.acm.org/code-of-ethics)
- [GDPR](https://gdpr.eu/)
- [Social Engineering Framework](https://www.social-engineer.org/framework/general-discussion/categories-social-engineers/ethics/)

---

**By using Pretexta, you agree to these ethical guidelines.**

Violations may result in:
- Legal action
- Project access revocation
- Reporting to authorities

*Last updated: January 2025*