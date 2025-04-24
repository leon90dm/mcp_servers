# Memory Module Tests

This directory contains tests for the memory module with Supabase integration.

## Prerequisites

Before running the tests, you need to:

1. Have a Supabase project set up with the memory schema applied
2. Set up your environment variables in one of two ways:

   **Option 1: Using a .env file (recommended)**

   Create or edit the `.env` file in the root directory of the memory module with the following content:

   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-supabase-anon-key
   STORAGE_TYPE=supabase
   ```

   **Option 2: Setting environment variables manually**

   Set the following environment variables:
   ```bash
   export SUPABASE_URL=https://your-project.supabase.co
   export SUPABASE_KEY=your-supabase-anon-key
   export STORAGE_TYPE=supabase
   ```

## Running the Tests

You can run the tests using npm:

```bash
# Run all tests
npm test

# Run only the direct Supabase test
npm run test:supabase

# Run only the memory module API test
npm run test:api
```

Or you can run the test scripts directly:

```bash
# Run all tests
./test/run-tests.sh

# Run only the direct Supabase test
node test/test-supabase.js

# Run only the memory module API test
node test/test-memory-api.js
```

## Test Descriptions

### Direct Supabase Test (`test-supabase.js`)

This test directly interacts with the Supabase database to:
- Create entities
- Add observations to entities
- Create relations between entities
- Verify that all data was stored correctly

### Memory Module API Test (`test-memory-api.js`)

This test uses the memory module's API to:
- Create entities
- Create relations
- Read the entire graph
- Search for nodes
- Open specific nodes
- Add observations
- Delete observations
- Delete relations
- Delete entities

## Cleanup

Both tests clean up after themselves by deleting all test data from the Supabase database.
