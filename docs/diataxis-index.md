# Diataxis Documentation Index

This repository uses the [Diataxis](https://diataxis.fr/) framework for technical documentation, organized into four canonical types.

## Documentation Structure

| Type | Purpose | Location |
|------|---------|----------|
| **Tutorials** | Learning-oriented, step-by-step guides for beginners | `tutorials/` |
| **How-to Guides** | Task-oriented, problem-solution format | `how-to/` |
| **Reference** | Technical specifications and API documentation | `reference/` |
| **Explanation** | Conceptual understanding and architecture | `explanation/` |

## Quick Start

New to BMAD Implementation Supervisor? Start here:

1. **[Installation Tutorial](./tutorials/installation.md)** - Get up and running in 5 minutes
2. **[First Workflow Tutorial](./tutorials/first-workflow.md)** - Run your first story
3. **[Configuration Guide](./how-to/configuration.md)** - Customize supervisor

## Documentation Navigation

### Tutorials
- [Installation](./tutorials/installation.md) - Setup and first run
- [First Workflow](./tutorials/first-workflow.md) - Complete story workflow
- [Telegram Setup](./tutorials/telegram-setup.md) - Configure notifications

### How-to Guides
- [Configuration](./how-to/configuration.md) - Customize supervisor behavior
- [Error Recovery](./how-to/error-recovery.md) - Handle failures
- [Telegram Commands](./how-to/telegram-commands.md) - Use bot commands
- [Health Monitoring](./how-to/health-monitoring.md) - Monitor supervisor status

### Reference
- [Configuration Schema](./reference/configuration.md) - Config file format
- [API Endpoints](./reference/api.md) - HTTP API documentation
- [Database Schema](./reference/database.md) - SQLite schema
- [CLI Commands](./reference/cli.md) - Command reference

### Explanation
- [Architecture](./explanation/architecture.md) - System design
- [State Machine](./explanation/state-machine.md) - Story lifecycle
- [Error Classification](./explanation/error-classification.md) - Error handling
- [Fallback Mechanism](./explanation/fallback.md) - Model fallback chain

## Contributing

When adding new features or documentation:

1. Follow Diataxis principles - choose the right canonical type
2. Keep tutorials beginner-friendly and task-focused
3. Keep how-to guides actionable and specific
4. Keep reference complete and precise
5. Keep explanation conceptual and thorough
