// Example job descriptions for "Try an example" on /match. Written for this
// site as typical postings for each role, not copied from real listings.
export const SAMPLE_JDS: { label: string; jd: string }[] = [
  {
    label: "Analytics engineer",
    jd: `Analytics Engineer, Data Platform team

You'll own the models that turn raw product and finance data into trusted tables for the whole company.

What you'll do
- Build and maintain ELT pipelines and dimensional models (star schemas) in our cloud data warehouse
- Write production-quality SQL and Python; review your teammates' code
- Orchestrate jobs and monitor data quality, freshness and lineage
- Partner with finance and product teams to define metrics and build dashboards
- Document models so analysts can self-serve

What we're looking for
- Strong SQL, including window functions and query tuning
- Python for data work (pandas)
- Experience with a cloud platform such as AWS (S3, Glue, Lambda) or GCP
- Data modelling: normalisation, Kimball-style dimensional design
- Git and code review habits; containers (Docker) are a plus
- Nice to have: dbt, Airflow, Kafka or another streaming tool
- Clear written communication with non-technical stakeholders`,
  },
  {
    label: "FP&A analyst",
    jd: `Financial Planning & Analysis Analyst

Join our FP&A team supporting the regional CFO on budgeting, forecasting and performance reporting.

Responsibilities
- Prepare the annual budget and rolling quarterly forecasts
- Analyse variances between actuals, budget and forecast, and explain the drivers to business leaders
- Build and maintain financial models in Excel (three-statement, scenario and sensitivity analysis)
- Support capital investment decisions with NPV, IRR and payback analysis
- Produce monthly management reporting packs and KPI dashboards
- Work with accounting on month-end close and cost allocations

Requirements
- Degree in Accountancy, Finance or a related field
- Solid understanding of financial statements and IFRS
- Management accounting knowledge: cost behaviour, contribution margin, transfer pricing
- Strong Excel; SQL or Python is a plus
- Experience with Power BI or Tableau preferred
- Attention to detail and the ability to present numbers clearly`,
  },
  {
    label: "Data scientist",
    jd: `Data Scientist, Risk Analytics

We use data to price credit risk and detect fraud across millions of transactions.

You will
- Develop and validate credit risk models (scorecards, probability of default)
- Engineer features from transaction and customer data; handle imbalanced classes
- Evaluate models with precision, recall, ROC/AUC and stability metrics
- Run experiments and communicate results to risk and business stakeholders
- Deploy models with engineering partners and monitor them in production

You have
- Strong Python (pandas, scikit-learn) and SQL
- Solid statistics: regression, hypothesis testing, sampling
- Experience with classification and clustering techniques
- Understanding of financial risk concepts (VaR, volatility, portfolio risk)
- Bonus: deep learning, NLP, or experience with Spark for large datasets
- Curiosity, and the ability to explain models to non-technical audiences`,
  },
];
