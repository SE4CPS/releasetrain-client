# Releasetrain Client

Releasetrain Client is an open source front end and REST API for tracking software version updates, component activity, Reddit discussions, and CVE-related entries.

## Prerequisites

* Node.js (LTS recommended)
* MongoDB database (Atlas or self-hosted)

## Installation

```bash
git clone https://github.com/antrunner/releasetrain-client.git
cd releasetrain-client
npm install
```

## Running the App

```bash
npm run dev
```

**Front End:**
[http://127.0.0.1:8080](http://127.0.0.1:8080)

**API Backend:**
[http://localhost:3000](http://localhost:3000)

## Configuration

Set environment variables or edit constants in the server file.

| Variable      | Description                             |
| ------------- | --------------------------------------- |
| `MONGODB_URI` | MongoDB connection string               |
| `DB_NAME`     | Database name (default: `releasetrain`) |
| `PORT`        | Server port (default: `3000`)           |

## API Overview

All endpoints return JSON.

Groups:

* Versions — `/api/v`
* Components — `/api/c`
* Reddit — `/api/reddit`
* Aggregates — `/api/aggregate`
* Test Utilities — `/api/test`

Base URLs:

* Local: `http://localhost:3000`
* Prod: `https://releasetrain.io/api`

## Versions (GET)

| Endpoint                                 | Example                                                                  | Description                                          |
| ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `/api/v`                                 | `/api/v?q=chrome,firefox`                                                | Recent versions for given components (last 2 years). |
| `/api/v/count`                           | `/api/v/count`                                                           | Total versions in last 2 years.                      |
| `/api/v/fc`                              | `/api/v/fc?q=mongodb`                                                    | Forecast next release date for a component.          |
| `/api/v/fcc`                             | `/api/v/fcc?q=chrome,firefox`                                            | Predict coincide release dates.                      |
| `/api/v/:id`                             | `/api/v/66fd52eaf1f36a17ad1e59c9`                                        | Version by MongoDB `_id`.                            |
| `/api/v/versionId/:versionId`            | `/api/v/versionId/20250217lobe-chat1.60.2`                               | Version by `versionId`.                              |
| `/api/v/aggregate/byDate`                | `/api/v/aggregate/byDate?date=20250715`                                  | Count releases on a specific date.                   |
| `/api/aggregate/v/updateTypeCount`       | `/api/aggregate/v/updateTypeCount?timestamp=20250715`                    | Count by update type (major/minor/patch).            |
| `/api/aggregate/v/componentTypeCount`    | `/api/aggregate/v/componentTypeCount?timestamp=20250715`                 | Count by classification type.                        |
| `/api/aggregate/v/versionCountByDay`     | `/api/aggregate/v/versionCountByDay?start=20250701&end=20250730`         | Total releases per day in a range.                   |
| `/api/aggregate/v/missingFields`         | `/api/aggregate/v/missingFields?field=versionNumber`                     | Docs missing a field (sample).                       |
| `/api/aggregate/v/sourceCountByType`     | `/api/aggregate/v/sourceCountByType?sourceType=patch&timestamp=20250715` | Count by source type (e.g., CVE, patch).             |
| `/api/aggregate/v/classificationSummary` | `/api/aggregate/v/classificationSummary?timestamp=20250715`              | Summary of security/breaking tags.                   |
| `/api/aggregate/v/oldestTimestamp`       | `/api/aggregate/v/oldestTimestamp?count=1000`                            | Oldest release date among last N.                    |

## Components (GET)

| Endpoint                                     | Example                    | Description                                          |
| -------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `/api/component/`                            | `/api/component/?q=linux`  | Components with optional text filter (last 2 years). |
| `/api/c/name/:componentName/:versionNumber?` | `/api/c/name/linux/6.10.5` | Versions for a component (optional exact version).   |
| `/api/c/os`                                  | `/api/c/os`                | OS components in last 2 years.                       |
| `/api/c/count`                               | `/api/c/count`             | Distinct component count (last 2 years).             |
| `/api/c/names`                               | `/api/c/names`             | Distinct component names (last 2 years).             |
| `/api/c/frequency`                           | `/api/c/frequency`         | High-frequency components and those updated today.   |

## Reddit (GET)

| Endpoint                     | Example                                          | Description                                              |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `/api/reddit`                | `/api/reddit?limit=100&page=1`                   | Reddit posts with pagination and filters.                |
| `/api/reddit/:redditId`      | `/api/reddit/1nq0h33`                            | Single post by `redditId` or `_id`.                      |
| `/api/reddit/by-subreddit`   | `/api/reddit/by-subreddit?q=firefox&minScore=50` | Posts for subreddit(s), optional score/comments filters. |
| `/api/reddit/query/positive` | `/api/reddit/query/positive`                     | Posts with positive predicted score > 0.5.               |
| `/api/reddit/count`          | `/api/reddit/count`                              | Total posts in last 2 years.                             |

## Test & Discovery (GET)

| Endpoint                   | Example                    | Description                         |
| -------------------------- | -------------------------- | ----------------------------------- |
| `/api/test/endpoints`      | `/api/test/endpoints`      | List all routes.                    |
| `/api/test/endpoints/html` | `/api/test/endpoints/html` | HTML table of routes with examples. |
| `/api/test/all`            | `/api/test/all`            | Run GET checks across endpoints.    |

## Common Query Parameters

| Param                     | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `q`                       | Comma-separated components (e.g., `chrome,firefox`). |
| `limit`, `page`           | Pagination controls.                                 |
| `cursor`                  | Base64 cursor for Reddit pagination.                 |
| `start`, `end`            | Date range `YYYYMMDD`.                               |
| `timestamp`, `date`       | Single date `YYYYMMDD`.                              |
| `fields`                  | CSV of fields to include (Reddit endpoints).         |
| `minScore`, `minComments` | Numeric Reddit filters.                              |

## Example

```bash
curl "http://localhost:3000/api/v?q=chrome,firefox"
```

```json
{
  "versions": [
    {
      "versionProductName": "Chrome",
      "versionNumber": "126.0.0",
      "versionReleaseDate": "20240612"
    },
    {
      "versionProductName": "Firefox",
      "versionNumber": "127.0.0",
      "versionReleaseDate": "20240611"
    }
  ]
}
```

## Contributing

Pull requests are welcome. Keep PRs focused, include tests or reproducible steps, and follow project conventions.

Issues: [https://github.com/antrunner/releasetrain-client/issues](https://github.com/antrunner/releasetrain-client/issues)

## License

See `LICENSE` in the repository.

## Contact

[sei40e@gmail.com](mailto:sei40e@gmail.com)

---

If you paste this directly into `README.md`, GitHub will render it correctly.
