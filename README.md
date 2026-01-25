# Lain-Lang

Lain is a propagator-based, highly expressive programming language and live coding runtime for distributed computation. Built with incremental compilation, lain-lang treats code as live data that automatically recompiles when definitions change. The system supports hot-swapping of closures without losing state, enabling live coding across multiple machines through peer-to-peer synchronization. Lain-lang can expand and hot-reload closures across peers, allowing you to modify function definitions on one machine and have those changes automatically propagate to all connected peers while preserving execution state. Computation happens reactively through cells and propagators that automatically update when their inputs change, with vector clocks ensuring correct causality in distributed scenarios.

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

## Key Features

### Distributed Live Coding

Lain-lang enables true distributed live coding with the following capabilities:

- **Closure Expansion Across Peers**: Closures can be expanded and shared across multiple peer connections, allowing distributed function definitions to be synchronized in real-time.

- **Hot-Reload Without State Loss**: Modify closure definitions on any peer, and the changes automatically propagate to all connected peers. The system preserves execution state during hot-reload, ensuring that running computations continue seamlessly with the updated definitions.

- **Peer-to-Peer Synchronization**: Built on Gun.js, lain-lang provides decentralized synchronization where any peer can act as a host or client, enabling flexible distributed computation topologies.

- **Incremental Compilation**: Code changes trigger automatic recompilation only for affected components, making the system efficient even with large codebases.

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
