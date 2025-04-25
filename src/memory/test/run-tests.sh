#!/bin/bash

# Load environment variables from .env file
if [ -f "../.env" ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' ../.env | xargs)
else
  echo "Warning: .env file not found. Make sure environment variables are set manually."
fi

# Check if Supabase credentials are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set"
  echo "Example: export SUPABASE_URL=https://your-project.supabase.co"
  echo "         export SUPABASE_KEY=your-anon-key"
  exit 1
fi

# Make sure storage type is set to Supabase
export STORAGE_TYPE=supabase

# Run the direct Supabase test
echo "Running direct Supabase test..."
node test-supabase.js
SUPABASE_TEST_RESULT=$?

if [ $SUPABASE_TEST_RESULT -ne 0 ]; then
  echo "Direct Supabase test failed!"
  exit 1
fi

echo "Direct Supabase test passed!"

# Run the memory module API test
echo "Running memory module API test..."
node test-memory-api.js
API_TEST_RESULT=$?

if [ $API_TEST_RESULT -ne 0 ]; then
  echo "Memory module API test failed!"
  exit 1
fi

echo "Memory module API test passed!"

# Run the embedding service test if vector search is enabled
if [ "$VECTOR_ENABLED" = "true" ] && [ ! -z "$EMBEDDING_API_KEY" ]; then
  echo "Running embedding service test..."
  node test-embedding-service.js
  EMBEDDING_TEST_RESULT=$?

  if [ $EMBEDDING_TEST_RESULT -ne 0 ]; then
    echo "Embedding service test failed!"
    exit 1
  fi

  echo "Embedding service test passed!"
else
  echo "Skipping embedding service test (VECTOR_ENABLED is not true or EMBEDDING_API_KEY is not set)"
fi

echo "All tests passed successfully!"
