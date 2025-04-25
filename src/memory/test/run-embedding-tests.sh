#!/bin/bash

# Change to the memory module directory
cd "$(dirname "$0")/.."

# Make sure the code is built
echo "Building the memory module..."
npm run build

# Run the embedding service tests
echo "Running embedding service tests..."
node test/test-embedding-service.js
