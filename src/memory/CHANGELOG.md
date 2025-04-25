# Changelog

All notable changes to the @toursnap/server-memory package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2024-10-01

### Added
- Semantic search capabilities using vector embeddings
- Support for Supabase's pgvector extension
- New `semantic_search` tool for finding semantically similar entities and observations
- Embedding service using jina-embeddings-v2-base-zh model
- Vector schema for Supabase setup
- Comprehensive tests for semantic search functionality

### Changed
- Updated README with semantic search documentation
- Enhanced Supabase storage provider with vector support
- Added environment variables for configuring vector search

## [0.7.0] - 2024-09-01

### Added
- Initial release of the memory module
- Knowledge graph implementation with entities, relations, and observations
- File-based and Supabase storage providers
- Basic search functionality using string matching
