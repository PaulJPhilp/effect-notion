# Dynamic Tables Testing Strategy

This document outlines the comprehensive testing strategy for the dynamic tables functionality in the Notion integration.

## Overview

The dynamic tables feature allows creating and manipulating Notion databases at runtime without requiring codegen. The testing strategy covers:

1. **Unit Tests** - Testing individual components in isolation
2. **Integration Tests** - Testing the full API surface with real Notion integration
3. **Test Runner** - Manual testing utilities for development and debugging

## Test Files

### 1. Unit Tests (`test/dynamic.schema.builder.test.ts`)

Tests the core schema building functionality in isolation:

- **`buildNotionPropertiesFromSimpleSpec`** - Converts simple schema specs to Notion API properties
- **`buildRuntimeEffectSchema`** - Builds Effect schemas from normalized database schemas
- **Property type coverage** - All Notion property types (title, select, multi_select, etc.)
- **Literal union validation** - Ensures select/multi_select options create proper literal unions
- **Error handling** - Graceful handling of unknown property types

**Key Test Cases:**
- Basic property types (title, number, checkbox, etc.)
- Select properties with predefined options
- Multi-select properties with predefined options
- Formula properties with different types
- Empty options arrays
- Unknown property types

### 2. Integration Tests (`test/dynamic.tables.integration.test.ts`)

End-to-end tests using the HTTP API with real Notion integration:

**Prerequisites:**
- `NOTION_API_KEY` environment variable
- `NOTION_TEST_PARENT_PAGE_ID` environment variable (a page where test databases can be created)

**Test Categories:**

#### Database Creation
- Creating databases with various schema specifications
- Handling invalid schema specifications
- Verifying created database properties match the spec

#### Dynamic Schema Building
- Fetching and building runtime schemas
- Comparing runtime schemas with codegen patterns
- Preserving select/multi_select options in schemas

#### CRUD Operations
- **Create** - Creating pages with Notion-native properties
- **Read** - Querying databases with filters and sorts
- **Update** - Updating page properties
- **Delete** - (Notion doesn't support page deletion via API)

#### Error Handling
- Non-existent database/page handling
- Invalid property updates
- API error responses

#### Schema Validation
- Verifying runtime schemas match codegen patterns
- Preserving property configurations (select options, formula types)
- Schema consistency across operations

### 3. Test Runner (`test/dynamic.tables.test.runner.ts`)

Manual testing utilities for development and debugging:

**Commands:**
```bash
# Create a test database
bun run test/dynamic.tables.test.runner.ts create-db

# Test CRUD operations on an existing database
bun run test/dynamic.tables.test.runner.ts test-crud <database-id>

# Get schema information for a database
bun run test/dynamic.tables.test.runner.ts get-schema <database-id>

# Run full test suite (create, schema, CRUD)
bun run test/dynamic.tables.test.runner.ts full-test
```

## Test Database Schema

The test suite uses a comprehensive schema that covers all major Notion property types:

```typescript
const testDbSpec: SimpleDbSpec = {
  Name: { type: "title" },
  Status: { 
    type: "select", 
    options: ["Draft", "Published", "Archived"] 
  },
  Tags: { 
    type: "multi_select", 
    options: ["tech", "news", "tutorial", "announcement"] 
  },
  Views: { type: "number" },
  IsPublic: { type: "checkbox" },
  PublishedAt: { type: "date" },
  Url: { type: "url" },
  Author: { type: "people" },
  Score: { type: "formula", formulaType: "number" },
  Priority: { type: "status", options: ["Low", "Medium", "High"] },
};
```

## Running Tests

### Unit Tests
```bash
# Run unit tests only
bun test test/dynamic.schema.builder.test.ts

# Run with coverage
bun test test/dynamic.schema.builder.test.ts --coverage
```

### Integration Tests
```bash
# Set up environment variables
export NOTION_API_KEY="your-notion-api-key"
export NOTION_TEST_PARENT_PAGE_ID="your-test-page-id"

# Run integration tests
bun test test/dynamic.tables.integration.test.ts

# Run with verbose output
bun test test/dynamic.tables.integration.test.ts --reporter=verbose
```

### Manual Testing
```bash
# Set up environment variables
export NOTION_API_KEY="your-notion-api-key"
export NOTION_TEST_PARENT_PAGE_ID="your-test-page-id"

# Run full test suite manually
bun run test/dynamic.tables.test.runner.ts full-test
```

## Test Data Management

### Creating Test Data
- Test databases are created with unique names using timestamps
- Test pages are created with predictable data for verification
- All test data uses the same comprehensive schema

### Cleanup
- **Note**: Notion doesn't provide an API to delete databases
- Test databases must be manually archived/deleted in the Notion UI
- Consider using a dedicated test workspace for integration tests

## Validation Strategy

### Schema Consistency
- Runtime schemas should match codegen patterns
- Select/multi_select options should be preserved
- Formula types should be correctly inferred

### API Compatibility
- All operations should work with Notion-native property shapes
- Error responses should be properly mapped
- Request/response schemas should be permissive for Notion data

### Effect Integration
- All operations should be properly wrapped in Effect
- Error handling should use Effect error types
- Schema validation should use Effect Schema

## Continuous Integration

### Automated Testing
- Unit tests run on every commit
- Integration tests run on pull requests (if environment variables are available)
- Schema builder tests ensure runtime schemas match codegen

### Manual Verification
- Test runner can be used for manual verification during development
- Full test suite validates end-to-end functionality
- Schema validation ensures consistency between runtime and codegen

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure `NOTION_API_KEY` and `NOTION_TEST_PARENT_PAGE_ID` are set
   - Verify the API key has appropriate permissions

2. **Rate Limiting**
   - Notion API has rate limits
   - Tests include delays and retry logic
   - Consider running tests during off-peak hours

3. **Schema Mismatches**
   - Runtime schemas should match codegen patterns
   - Check that property configurations are preserved
   - Verify literal unions are correctly generated

4. **Test Data Cleanup**
   - Test databases must be manually cleaned up
   - Use a dedicated test workspace
   - Archive old test databases regularly

### Debug Mode
```bash
# Run tests with debug logging
DEBUG=* bun test test/dynamic.tables.integration.test.ts

# Use test runner with verbose output
bun run test/dynamic.tables.test.runner.ts full-test
```

## Future Enhancements

### Planned Test Improvements
- **Mock Notion API** - Unit tests without real API calls
- **Property Type Coverage** - Tests for all Notion property types
- **Performance Testing** - Schema building performance benchmarks
- **Concurrency Testing** - Multiple simultaneous operations

### Test Infrastructure
- **Test Database Pool** - Reusable test databases
- **Automated Cleanup** - Scripts to clean up test data
- **Test Data Factories** - Utilities to generate test data
- **Visual Regression Testing** - Compare schema outputs

## Contributing

When adding new dynamic table features:

1. **Add Unit Tests** - Test the core functionality in isolation
2. **Add Integration Tests** - Test the full API surface
3. **Update Test Runner** - Add manual testing utilities
4. **Update Documentation** - Document new test patterns

Follow the existing test patterns and ensure all new functionality is properly tested.
