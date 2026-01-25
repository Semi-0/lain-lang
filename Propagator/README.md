# ppropogator

TypeScript implementation of propagator system from the art of propagator & SDF.

Including the implementation of basic cells, propagators, support layer, generic arithmetic, as well as simple backtracking(amb op).

Also, a customized observer-based reactive system has been included for transmitting values between cells and propagators, and a more generic scheduler supports promise, which is different from the scheme implementation.

So, both the cell and propagator could be observed by external observers, this could potentially open up some possibilities for visualization.

## Installation

### Prerequisites

- [Bun](https://bun.sh) (latest version recommended)
- Git

### Quick Start

1. Clone this repository:
```bash
git clone https://github.com/Semi-0/Propagator.git
cd Propagator
```

2. Run the install script:
```bash
./install.sh
```

The install script will:
- Set up the workspace structure
- Clone required workspace dependencies (GenericProcedure, Sando) from GitHub
- Install all dependencies with `bun install`
- Run tests to verify installation

### Manual Setup

If you prefer to set up manually:

1. Create a workspace directory and clone this repository:
```bash
mkdir propagator-workspace
cd propagator-workspace
git clone https://github.com/Semi-0/Propagator.git Propagator
```

2. Clone workspace dependencies:
```bash
git clone https://github.com/Semi-0/GenericProcedure.git GenericProcedure
git clone https://github.com/Semi-0/Sando.git Sando
```

3. Create workspace `package.json`:
```json
{
  "name": "propagator-workspace",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "Propagator",
    "GenericProcedure",
    "Sando"
  ]
}
```

4. Install dependencies:
```bash
bun install
```

### Running Tests

```bash
cd Propagator
bun test
```

## Todos

1. simplify premise->cell->amb subs
2. integrate with socket/libp2p for distributed computation
3. localize premises maintainance system(means premises also should notify whatever cell it was propagated to for update)

This project was created using `bun init` in bun v1.1.18. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
