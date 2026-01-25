# lain-lang

A highly expressive programming language and live coding runtime for distributed computation.

## Installation

### Prerequisites

- [Bun](https://bun.sh) (latest version recommended)
- Git

### Quick Start

1. Clone this repository:
```bash
git clone https://github.com/Semi-0/lain-lang.git
cd lain-lang
```

2. Run the install script:
```bash
./install.sh
```

The install script will:
- Detect the repository structure automatically
- Set up the workspace structure at the parent directory
- Clone required workspace dependencies (Propagator, GenericProcedure, PMatcher, Sando) from their GitHub repositories
- Install all dependencies with `bun install`

3. Run tests to verify installation:
```bash
cd ..
bun test lain-lang/lain-lang/test
```

Or from the workspace root:
```bash
cd lain-lang/lain-lang
bun test
```

### Manual Setup

If you prefer to set up manually:

1. Create a workspace directory and clone this repository:
```bash
mkdir lain-lang-workspace
cd lain-lang-workspace
git clone https://github.com/Semi-0/lain-lang.git lain-lang
```

2. Clone workspace dependencies:
```bash
git clone https://github.com/Semi-0/Propagator.git Propogator
git clone https://github.com/Semi-0/GenericProcedure.git GenericProcedure
git clone https://github.com/Semi-0/PMatcher.git PMatcher
git clone https://github.com/Semi-0/Sando.git Sando
```

3. Create workspace `package.json`:
```json
{
  "name": "lain-lang-workspace",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "lain-lang",
    "Propogator",
    "GenericProcedure",
    "PMatcher",
    "Sando"
  ]
}
```

4. Install dependencies:
```bash
bun install
```

## Usage

### Running Tests

```bash
cd lain-lang
bun test
```

### CLI Commands

After installation, you can use the following commands:

- **Host Server**: `bun run lain-host`
- **Peer Client**: `bun run lain-peer`
- **REPL**: `bun run lain-repl`

Or use the binaries directly:
```bash
bun run lain-host
bun run lain-peer
bun run lain-repl
```

## Project Structure

- `compiler/` - Language compiler implementation
- `DB/` - Database adapters and serialization
- `src/cli/` - Command-line interface entry points
- `src/p2p/` - P2P synchronization setup
- `test/` - Test files

## Workspace Dependencies

This project uses a Bun workspace with the following dependencies:

- **Propogator** - Propagator network implementation
- **GenericProcedure** - Generic procedure handlers
- **PMatcher** - Pattern matching library
- **Sando** - Layered data structures

These are managed as separate git repositories and are automatically set up by the install script.

## Development

The project uses:
- **Bun** for package management and runtime
- **TypeScript** for type safety
- **Gun.js** for P2P synchronization

## License

See LICENSE file for details.
