# Orkestro Worker Node Setup Guide

*Read this in [Turkish](README.tr.md)*

This guide explains how to configure, set up, and run headless Orkestro worker nodes. 
A worker node connects to the Orkestro master server via WebSockets and BullMQ to autonomously process your Kanban cards in the background.

## 1. Prerequisites
- **Node.js**: v18 or newer
- **Git**
- **NPM**

### Validating & Installing Prerequisites
Before setting up the worker, verify that your machine has the necessary packages:
```bash
node -v   # Should output v18.x.x or higher
npm -v    # Should output your NPM version
git --version
```

If these packages are missing, install them via your operating system's package manager. For example, on **Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install -y nodejs npm git
```

## 2. Install Agent CLI Tools
Workers require the command line interface applications of the respective AI agents you wish to run.
The worker automatically detects which agents are installed and advertises its capabilities to the master.

### Authentication Methods

You have two options to authenticate the agents before running them.

**Option A: Browser OAuth Login (Recommended for Local Machines/UI Servers)**
If your worker machine has a visual interface (desktop) or you can open the provided terminal links in a web browser:
```bash
# Install the CLI agents globally
npm install -g @anthropic-ai/claude-cli @google/gemini-cli opencode

# Login interactively through your browser
claude auth
gemini login
opencode login
```

**Option B: Direct API Keys (Recommended for Headless/Remote Cloud Servers)**
If your worker is entirely headless and automated securely through pipelines, you must generate API keys from the provider consoles:
- **Anthropic (Claude)**: [console.anthropic.com](https://console.anthropic.com/)
- **Google Gemini**: [Google AI Studio](https://aistudio.google.com/app/apikey)
- **OpenAI**: [platform.openai.com](https://platform.openai.com/api-keys)

```bash
# Export the API keys in your ~/.bashrc or ~/.zshrc profile
export ANTHROPIC_API_KEY="sk-ant..."
export GEMINI_API_KEY="AIza..."
export OPENAI_API_KEY="sk-proj..."

# Install the CLI agents globally
npm install -g @anthropic-ai/claude-cli @google/gemini-cli opencode
```

## 3. Environment Configuration (.env)
Clone the `orkestro-worker` repository to your worker machine. Inside the root directory, copy the `.env.example` file to `.env` and fill in the parameters:
```bash
git clone https://github.com/sevket/orkestro-worker.git
cd orkestro-worker
cp .env.example .env
```
Inside the `.env` file:
```dotenv
# Optional: Hardcode a specific worker name, otherwise it auto-generates a UUID
WORKER_ID=my-cloud-worker-1

# REQUIRED: Point to your Master Orkestro Web Socket
MASTER_URL=ws://YOUR_MASTER_IP:8787

# REQUIRED: Point to the Master Orkestro's Redis instance
REDIS_URL=redis://YOUR_MASTER_IP:6379

# Limit the maximum concurrent agent runs (default is 4)
WORKER_CAPACITY=4

# Define roles (default: ["coder"])
WORKER_ROLES=["coder", "planner", "reviewer"]
```

## 4. Run the Automatic Setup Script
If you want to quickly install modules and deploy on a fresh machine, you can run the provided bash script:
```bash
./worker-setup.sh
```

## 5. Running the Worker in the Background
The recommended way to deploy workers is using PM2, a production process manager for Node.js.

```bash
# Install PM2 if you haven't already
npm install -g pm2

# Install worker dependencies
npm install

# Start the worker process
pm2 start npm --name "orkestro-worker" -- run start

# Make it start on system boot
pm2 startup
pm2 save

# Monitor worker logs
pm2 logs orkestro-worker
```

Once the worker successfully boots, it will emit a connection echo to the Master server. 
You will see `{Worker Node} is alive and ready to process jobs!` in the master Node console, and the worker will instantly appear in the Orkestro Web UI under the **Fleet** menu!
