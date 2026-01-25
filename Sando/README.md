# Sando  サンド 

An interesting layer system for handling side effects, converted from Software Design For Flexibility.

## Installation

### Prerequisites

- [Bun](https://bun.sh) (latest version recommended)
- Git

### Quick Start

1. Clone this repository:
```bash
git clone https://github.com/Semi-0/Sando.git
cd Sando
```

2. Run the install script:
```bash
./install.sh
```

The install script will:
- Set up the workspace structure
- Clone required workspace dependencies (GenericProcedure) from GitHub
- Install all dependencies with `bun install`
- Run tests to verify installation

### Manual Setup

If you prefer to set up manually:

1. Create a workspace directory and clone this repository:
```bash
mkdir sando-workspace
cd sando-workspace
git clone https://github.com/Semi-0/Sando.git Sando
```

2. Clone workspace dependencies:
```bash
git clone https://github.com/Semi-0/GenericProcedure.git GenericProcedure
```

3. Create workspace `package.json`:
```json
{
  "name": "sando-workspace",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "Sando",
    "GenericProcedure"
  ]
}
```

4. Install dependencies:
```bash
bun install
```

### Using as a Package

To install this library as a package, run:
```bash
bun install sando-layer
```

