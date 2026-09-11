# Project Orion — AI-Powered Customer Intelligence Platform
## Executive Summary & Strategic Report Q3 2026

---

## 1. Overview

Project Orion is an internal initiative to build a unified AI-powered customer intelligence platform for Bacancy Technology. The goal is to centralise customer interaction data, apply machine learning models for behavioural analysis, and surface actionable insights to sales, support, and product teams in real time.

The platform integrates data from CRM systems, support tickets, product usage telemetry, and NPS surveys into a single analytical layer powered by large language models and predictive analytics.

---

## 2. Key Topics

### 2.1 Customer Segmentation Engine
The segmentation engine classifies customers into five tiers — Enterprise, Growth, Starter, At-Risk, and Churned — based on 47 behavioural signals including login frequency, feature adoption rate, support ticket volume, and contract renewal history. The model achieves 91% accuracy on the validation set.

### 2.2 Churn Prediction Model
A gradient-boosted ensemble model predicts customer churn with a 30-day lead time. The model uses recency, frequency, and monetary (RFM) scores alongside product engagement metrics. Early results show a precision of 87% and recall of 82% on the test cohort of 1,200 accounts.

### 2.3 Sentiment Analysis Pipeline
Support tickets and customer emails are processed through a fine-tuned BERT model to extract sentiment scores, urgency labels, and topic categories. This enables the support team to prioritise high-risk conversations before they escalate.

### 2.4 Revenue Forecasting
The platform produces a 90-day revenue forecast by combining churn probability scores with upsell likelihood models. Current MRR at time of writing is $2.4M with a forecasted range of $2.6M–$2.9M for Q4 2026.

### 2.5 Real-Time Alerting
An alerting system notifies account managers when a customer's health score drops below a configurable threshold. Alerts are delivered via Slack and email within 15 minutes of the triggering event.

---

## 3. Main Findings & Conclusions

### Finding 1 — Early Intervention Saves Revenue
Customers contacted within 48 hours of a health score drop show a 34% higher retention rate compared to those contacted after 7 days. This validates the investment in real-time alerting infrastructure.

### Finding 2 — Feature Adoption is the Strongest Churn Signal
Across all 47 signals analysed, feature adoption rate (specifically whether a customer uses 3 or more core features) is the single strongest predictor of long-term retention. Customers using 3+ core features have a 12-month churn rate of only 4%, versus 31% for single-feature users.

### Finding 3 — Support Ticket Volume is a Lagging Indicator
Contrary to initial assumptions, high support ticket volume alone is not a reliable churn predictor. Customers with high ticket volume but fast resolution times (under 4 hours) show similar retention rates to low-ticket customers. Resolution speed matters more than ticket count.

### Finding 4 — NPS Alone is Insufficient
NPS scores correlate weakly with actual churn (r = 0.31). Combining NPS with product usage data improves predictive accuracy by 22 percentage points. Standalone NPS surveys are not recommended as a primary health metric.

### Finding 5 — Enterprise Accounts Have Unique Risk Patterns
Enterprise accounts (ACV > $100K) exhibit different churn patterns than SMB accounts. Enterprise churn is driven primarily by stakeholder turnover and procurement cycles, not product satisfaction. These accounts require a separate predictive model with different feature weights.

---

## 4. Core Concepts

### Customer Health Score (CHS)
A composite score from 0–100 calculated weekly for every active account. It weights feature adoption (40%), support experience (25%), engagement frequency (20%), and NPS/survey data (15%). A CHS below 40 triggers an at-risk alert.

### Reciprocal Rank Fusion (RRF)
The platform uses RRF to merge signals from multiple ML models into a single ranked list of at-risk accounts. This prevents any single noisy model from dominating the output and improves overall signal quality.

### Cohort Analysis
Customers are grouped by their start month and tracked over time to measure retention curves. Cohorts starting after the onboarding redesign (March 2026) show a 18% improvement in 90-day retention compared to earlier cohorts.

### Lead Scoring Integration
Churn risk scores are fed back into the CRM as negative lead scores, allowing sales to prioritise renewal conversations and identify upsell opportunities among healthy accounts simultaneously.

---

## 5. Action Items & Next Steps

### Immediate (0–30 days)
- [ ] Deploy the churn model to production for all Growth and Enterprise tier accounts
- [ ] Configure Slack alerting for account managers — threshold set at CHS < 40
- [ ] Conduct a data quality audit on CRM records older than 18 months
- [ ] Brief the customer success team on how to interpret health score dashboards

### Short-term (30–90 days)
- [ ] Build a separate churn model for Enterprise accounts using stakeholder-level signals
- [ ] Integrate support ticket resolution time into the CHS calculation
- [ ] Launch A/B test comparing AI-generated outreach emails vs. standard templates
- [ ] Onboard two pilot customers to the self-serve analytics dashboard
- [ ] Achieve SOC 2 Type I certification for the data pipeline

### Long-term (90–180 days)
- [ ] Expand platform to include partner and reseller account health monitoring
- [ ] Implement automated playbooks — system recommends specific interventions based on churn reason classification
- [ ] Build a product recommendation engine that suggests underused features to customers based on peer group behaviour
- [ ] Publish internal case study on retention improvements for company-wide knowledge sharing

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data privacy compliance (GDPR) | Medium | High | Anonymise PII before model training; appoint DPO reviewer |
| Model drift over time | High | Medium | Schedule monthly model retraining with fresh data |
| Low adoption by account managers | Medium | High | Run training workshops; embed CHS in existing CRM view |
| Infrastructure cost overrun | Low | Medium | Set cloud spend alerts at 80% of budget |

---

## 7. Team & Ownership

- **Project Lead**: Nikunj Suthar (Engineering)
- **Data Science**: Krutika Prajapati
- **Backend Infrastructure**: Bacancy Platform Team
- **Stakeholder**: VP of Customer Success

---

*Document version 1.4 — Last updated September 2026*
*Classification: Internal — Confidential*
