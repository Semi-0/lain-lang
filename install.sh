#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up lain-lang workspace...${NC}\n"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine workspace root and project location
# When cloning the repo, structure is: cloned-dir/lain-lang/ (repo root with install.sh)
# The actual project is at: cloned-dir/lain-lang/lain-lang/
# We want workspace root to be: cloned-dir/ (parent of repo root)

if [ -d "$SCRIPT_DIR/lain-lang" ] && [ -f "$SCRIPT_DIR/lain-lang/package.json" ]; then
    # We're in the cloned repository root (has lain-lang/ subdirectory)
    # Workspace root should be the parent directory
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    LAIN_LANG_PATH="lain-lang/lain-lang"
    echo -e "${BLUE}📁 Detected cloned repository structure${NC}"
elif [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"name": "lain-lang"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
    # We're in the actual lain-lang project directory
    # Workspace root is parent
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    LAIN_LANG_PATH="lain-lang"
    echo -e "${BLUE}📁 Detected project directory${NC}"
else
    # Default: assume script is in project root, workspace is parent
    WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    LAIN_LANG_PATH="lain-lang"
fi

# Check if we're in a workspace context (has workspace package.json)
cd "$WORKSPACE_ROOT"
if [ ! -f "package.json" ] || ! grep -q '"name": "lain-lang-workspace"' package.json 2>/dev/null; then
    echo -e "${YELLOW}⚠️  No workspace package.json found. Creating workspace structure...${NC}"
    
    # Verify the lain-lang path exists
    if [ ! -d "$LAIN_LANG_PATH" ]; then
        echo -e "${RED}❌ Error: Cannot find lain-lang at $LAIN_LANG_PATH${NC}"
        echo -e "${YELLOW}Current directory: $(pwd)${NC}"
        echo -e "${YELLOW}Expected path: $LAIN_LANG_PATH${NC}"
        exit 1
    fi
    
    # Create workspace package.json
    cat > package.json << EOF
{
  "name": "lain-lang-workspace",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "$LAIN_LANG_PATH",
    "Propagator",
    "GenericProcedure",
    "PMatcher",
    "Sando"
  ]
}
EOF
    echo -e "${GREEN}✅ Created workspace package.json${NC}"
else
    echo -e "${GREEN}✅ Workspace package.json found${NC}"
fi

cd "$WORKSPACE_ROOT"

# Clone workspace dependencies
clone_dep() {
    local DEP_NAME="$1"
    local DEP_REPO="$2"
    
    if [ -d "$DEP_NAME" ]; then
        if [ -d "$DEP_NAME/.git" ]; then
            echo -e "${BLUE}📦 $DEP_NAME already exists (git repo)${NC}"
        else
            echo -e "${YELLOW}⚠️  $DEP_NAME exists but is not a git repo. Skipping...${NC}"
        fi
    else
        echo -e "${BLUE}📥 Cloning $DEP_NAME from $DEP_REPO...${NC}"
        git clone "$DEP_REPO" "$DEP_NAME" || {
            echo -e "${RED}❌ Failed to clone $DEP_NAME${NC}"
            exit 1
        }
        echo -e "${GREEN}✅ Cloned $DEP_NAME${NC}"
    fi
}

# Clone workspace dependencies
clone_dep "Propagator" "https://github.com/Semi-0/Propagator.git"
clone_dep "GenericProcedure" "https://github.com/Semi-0/GenericProcedure.git"
clone_dep "PMatcher" "https://github.com/Semi-0/PMatcher.git"
clone_dep "Sando" "https://github.com/Semi-0/Sando.git"

# Install dependencies
echo -e "\n${BLUE}📦 Installing dependencies with bun...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ bun is not installed. Please install bun first:${NC}"
    echo -e "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

bun install || {
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
}

echo -e "\n${GREEN}✅ Dependencies installed${NC}"

# Verify installation by running tests
echo -e "\n${BLUE}🧪 Running tests to verify installation...${NC}"
cd "$WORKSPACE_ROOT"

# Determine the test path
if [ -d "$LAIN_LANG_PATH/test" ]; then
    TEST_PATH="$LAIN_LANG_PATH/test"
elif [ -d "lain-lang/lain-lang/test" ]; then
    TEST_PATH="lain-lang/lain-lang/test"
elif [ -d "lain-lang/test" ]; then
    TEST_PATH="lain-lang/test"
else
    echo -e "${YELLOW}⚠️  Test directory not found, skipping test verification${NC}"
    TEST_PATH=""
fi

if [ -n "$TEST_PATH" ]; then
    if bun test "$TEST_PATH" 2>&1; then
        echo -e "\n${GREEN}✅ All tests passed!${NC}"
    else
        TEST_EXIT_CODE=$?
        echo -e "\n${RED}❌ Some tests failed. Installation completed but tests did not pass.${NC}"
        echo -e "${YELLOW}You may want to check the test output above for details.${NC}"
        # Don't exit with error - installation succeeded, tests just failed
        # This allows users to proceed even if tests fail
    fi
fi

echo -e "\n${GREEN}✅ Workspace setup complete!${NC}\n"
echo -e "${BLUE}You can now:${NC}"
if [ -n "$LAIN_LANG_PATH" ]; then
    echo -e "  • Run tests: ${YELLOW}cd $LAIN_LANG_PATH && bun test${NC}"
    echo -e "  • Start host: ${YELLOW}cd $LAIN_LANG_PATH && bun run lain-host${NC}"
    echo -e "  • Start peer: ${YELLOW}cd $LAIN_LANG_PATH && bun run lain-peer${NC}"
    echo -e "  • Start REPL: ${YELLOW}cd $LAIN_LANG_PATH && bun run lain-repl${NC}"
else
    echo -e "  • Run tests: ${YELLOW}cd lain-lang && bun test${NC}"
    echo -e "  • Start host: ${YELLOW}cd lain-lang && bun run lain-host${NC}"
    echo -e "  • Start peer: ${YELLOW}cd lain-lang && bun run lain-peer${NC}"
    echo -e "  • Start REPL: ${YELLOW}cd lain-lang && bun run lain-repl${NC}"
fi
echo -e "\n${YELLOW}Note:${NC} Make sure to run commands from the workspace root or use 'cd' to the project directory first."
