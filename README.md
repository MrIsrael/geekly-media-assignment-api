# API server to link a React frontend with a Google Sheet, using it as a database. Created using NodeJS.
Private API for Geekly Media React / API assignment. Acting as CRUD endpoint server to handle data stored on shared Google Sheet, using Google "service account" authentication.
Hosted and running on Netlify, using serverless functions to operate.

**IMPORTANT**:
- Set your environment variables in an .env file on repository's root folder, to use it in dev mode.
Mandatory: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
Optional: GOOGLE_SPREADSHEET_ID_FROM_URL

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL= # example: foo-bar-api@foo-bar-123456.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY= # example: -----BEGIN PRIVATE KEY-----\nANBgkqhkiGMIIBADIEvA etc etc... (long key)
GOOGLE_SPREADSHEET_ID_FROM_URL= # example: FctMpu_reo510abcuiOYHJstjVS7mZhgVw-3lTit4pvp
```

- Set the env variables directly on Netlify UI, and include .env file on .gitignore, when deploying repo for production.

- **Version of Node used: 16.9.0. Download NodeJS [here](https://nodejs.org/en/)**

## Made by
- [Israel Uribe](https://github.com/MrIsrael)

## License
Copyright © Israel Uribe - November 2023
