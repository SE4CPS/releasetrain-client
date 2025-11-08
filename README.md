````markdown
# Releasetrain Client

Releasetrain Client is an open source front end and REST API for tracking software version updates, component activity, Reddit discussions, and CVE-related entries.

## Prerequisites

- Node.js (LTS recommended)
- MongoDB database (Atlas or self-hosted)

## Installation

```bash
git clone https://github.com/antrunner/releasetrain-client.git
cd releasetrain-client
npm install
````

## Running the App

```bash
npm run dev
```

App UI:

* [http://127.0.0.1:8080](http://127.0.0.1:8080)

Backend API (Express):

* [http://localhost:3000](http://localhost:3000)

## Configuration

Set environment variables as needed (or edit the constants in the server file):

* `MONGODB_URI` (or inline `uri` constant)
* `DB_NAME` (or inline `dbName` constant)
* Default port for API is `3000`

## API Overview

All responses are JSON.
API groups:

* Versions `/api/v`
* Components `/api/c`
* Reddit `/api/reddit`
* Aggregates `/api/aggregate`
* Test utilities `/api/test`

Base URL examples:

* Local: `http://localhost:3000`
* Hosted: `https://releasetrain.io/api`

---

## GET Endpoints

### Versions

| Path                                     | Example                                                                  | Description                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `/api/v`                                 | `/api/v?q=chrome,firefox`                                                | Recent versions. Optional query `q` supports one or more component names separated by comma. |
| `/api/v/count`                           | `/api/v/count`                                                           | Count of versions in the last two years.                                                     |
| `/api/v/fc`                              | `/api/v/fc?q=mongodb`                                                    | Forecast next release date for a component (from `releasetrain-forecast`).                   |
| `/api/v/fcc`                             | `/api/v/fcc?q=chrome,firefox`                                            | Forecast coincide release dates for multiple components.                                     |
| `/api/v/:id`                             | `/api/v/66fd52eaf1f36a17ad1e59c9`                                        | Fetch a version by MongoDB `_id`.                                                            |
| `/api/v/versionId/:versionId`            | `/api/v/versionId/20250217lobe-chat1.60.2`                               | Fetch a version by `versionId`.                                                              |
| `/api/v/aggregate/byDate`                | `/api/v/aggregate/byDate?date=20250715`                                  | Count releases on a given date `YYYYMMDD`.                                                   |
| `/api/aggregate/v/updateTypeCount`       | `/api/aggregate/v/updateTypeCount?timestamp=20250715`                    | Count major, minor, patch for a date.                                                        |
| `/api/aggregate/v/componentTypeCount`    | `/api/aggregate/v/componentTypeCount?timestamp=20250715`                 | Count releases by classification types for a date.                                           |
| `/api/aggregate/v/versionCountByDay`     | `/api/aggregate/v/versionCountByDay?start=20250701&end=20250730`         | Aggregate total releases per day for a range.                                                |
| `/api/aggregate/v/missingFields`         | `/api/aggregate/v/missingFields?field=versionNumber&limit=50`            | Sample documents missing a specific field.                                                   |
| `/api/aggregate/v/sourceCountByType`     | `/api/aggregate/v/sourceCountByType?sourceType=patch&timestamp=20250715` | Count releases by source type for a date.                                                    |
| `/api/aggregate/v/classificationSummary` | `/api/aggregate/v/classificationSummary?timestamp=20250715`              | Summarize classification tags for a date.                                                    |
| `/api/aggregate/v/oldestTimestamp`       | `/api/aggregate/v/oldestTimestamp?count=1000`                            | Oldest `versionReleaseDate` among the latest N updates.                                      |

### Components

| Path                                         | Example                    | Description                                                                  |
| -------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `/api/component/`                            | `/api/component/?q=linux`  | Components within last two years, optional filter on name or predicted type. |
| `/api/c/name/:componentName/:versionNumber?` | `/api/c/name/linux/6.10.5` | Versions for a component, optional exact version.                            |
| `/api/c/os`                                  | `/api/c/os`                | Operating system components in last two years.                               |
| `/api/c/count`                               | `/api/c/count`             | Count of distinct components released in last two years.                     |
| `/api/c/names`                               | `/api/c/names`             | Distinct component names in last two years.                                  |
| `/api/c/frequency`                           | `/api/c/frequency`         | High-frequency components and those updated today.                           |

### Reddit

| Path                         | Example                              | Description                                                                                     |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `/api/reddit`                | `/api/reddit?limit=100&page=1`       | Reddit posts. Supports pagination and filter flags (`isUpdateRelated`, `isUpdateRelatedValue`). |
| `/api/reddit/:redditId`      | `/api/reddit/1nq0h33`                | Single post by `redditId` or Mongo `_id`.                                                       |
| `/api/reddit/by-subreddit`   | `/api/reddit/by-subreddit?q=firefox` | Posts by subreddit. Supports `minScore`, `minComments`, `limit`, `page`, `fields`.              |
| `/api/reddit/query/positive` | `/api/reddit/query/positive`         | Posts with `metadata.predicted.positiveScore > 0.5`.                                            |
| `/api/reddit/count`          | `/api/reddit/count`                  | Count of Reddit posts in last two years.                                                        |

### Test and Discovery

| Path                       | Example                    | Description                                                 |
| -------------------------- | -------------------------- | ----------------------------------------------------------- |
| `/api/test/endpoints`      | `/api/test/endpoints`      | Enumerate registered API routes.                            |
| `/api/test/endpoints/html` | `/api/test/endpoints/html` | HTML view with example queries and example outputs.         |
| `/api/test/all`            | `/api/test/all`            | Invoke a curated set of GET endpoints and report responses. |

---

## Query Parameters

* `q` component list `chrome,firefox`
* `limit` integer for pagination
* `page` integer for pagination
* `cursor` base64 cursor for Reddit paging
* `start` and `end` date `YYYYMMDD`
* `timestamp` date `YYYYMMDD`
* `date` date `YYYYMMDD`
* `fields` CSV projection list in Reddit by-subreddit endpoint
* `minScore` and `minComments` numeric filters for Reddit

---

## Example

Recent versions for Chrome and Firefox:

```bash
curl "http://localhost:3000/api/v?q=chrome,firefox"
```

Example response:

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

---

## Contributing

Open issues and pull requests in the repository.
Focus changes on a single feature or fix, include tests or reproducible steps, and provide clear commit messages.

* Issues: [https://github.com/antrunner/releasetrain-client/issues](https://github.com/antrunner/releasetrain-client/issues)
* Code style: follow existing project conventions
* Tests: validate queries and endpoint behavior locally

## License

See `LICENSE` in the repository.

## Contact

[sei40e@gmail.com](mailto:sei40e@gmail.com)

```
::contentReference[oaicite:0]{index=0}
```
