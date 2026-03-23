import os from "node:os";
import { io, Socket } from "socket.io-client";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { exec, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLogSimplifier } from "./runner.js";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { EventEmitter } from "node:events";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const __server_dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple slot manager for concurrent jobs (Semaphore)
const capacitySlots = new Set<number>();
const capacityEmitter = new EventEmitter();

/**
 * AI Context: 
 * Eşzamanlı (Concurrency) işlemlerin donanımı kilitlememesi için geliştirilmiş bir Semaphore (Slot) mekanizması.
 * Kapasite doluysa, yeni BullMQ görevlerini boş bir slot (yuva) açılana kadar asenkron olarak bekletir.
 */
async function waitAndAcquireSlot(max: number): Promise<number> {
  const tryAcquire = () => {
    for (let i = 1; i <= max; i++) {
      if (!capacitySlots.has(i)) {
        capacitySlots.add(i);
        return i;
      }
    }
    return -1;
  };

  let slot = tryAcquire();
  if (slot !== -1) return slot;

  return new Promise((resolve) => {
    const listener = () => {
      slot = tryAcquire();
      if (slot !== -1) {
        capacityEmitter.off('slot_freed', listener);
        resolve(slot);
      }
    };
    capacityEmitter.on('slot_freed', listener);
  });
}

function releaseSlot(slot: number) {
  capacitySlots.delete(slot);
  capacityEmitter.emit('slot_freed');
}

// Load .env file manually (no dotenv dependency)
const envFilePath = path.resolve(__server_dirname, "..", ".env");
try {
  if (fs.existsSync(envFilePath)) {
    const envContent = fs.readFileSync(envFilePath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Don't override existing env vars (process env takes precedence)
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
} catch { /* ignore .env read errors */ }

// The Redis URL used by BullMQ
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

/**
 * AI Context:
 * Worker'ın barındırıldığı sunucunun donanım kaynaklarına (CPU ve RAM) göre otonom kapasite hesaplar.
 * V8/Node.js süreçlerinin OOM (Out Of Memory) çöküşünü önlemek adına her yerel AI ajanına ortalama 1.5GB RAM limiti varsayılır.
 */
export const WORKER_REQUESTED_CAPACITY = Number(process.env.WORKER_CAPACITY || "4");
const _cpus = os.cpus().length;
const _freeMemGB = os.freemem() / (1024 * 1024 * 1024);
const _cpuLimit = Math.max(1, _cpus - 1);
const _memLimit = Math.max(1, Math.floor(_freeMemGB / 1.5));
const _safeMax = Math.min(_cpuLimit, _memLimit);

export const WORKER_ASSIGNED_CAPACITY = Math.min(WORKER_REQUESTED_CAPACITY, _safeMax);

if (WORKER_REQUESTED_CAPACITY > WORKER_ASSIGNED_CAPACITY) {
  console.log(`[Worker] Requested capacity ${WORKER_REQUESTED_CAPACITY} exceeds hardware limits. Auto-scaled capacity to ${WORKER_ASSIGNED_CAPACITY} (Constraints - CPUs: ${_cpus}, Free RAM: ${_freeMemGB.toFixed(1)}GB)`);
} else {
  console.log(`[Worker] Hardware capacity check passed. Assigned Capacity: ${WORKER_ASSIGNED_CAPACITY}`);
}

// Mappings for active processes to be killed remotely
const activeProcesses = new Map<string, ChildProcess>();

/**
 * AI Context:
 * Node.js'de process.kill(pid) sadece ana süreci öldürür ancak AI aracı CLI'ları (claude, opencode) kendi alt süreçlerini (child tree) oluşturur.
 * Arkada yetim (orphan) kaynak sızıntısı bırakmamak için negatif PID (-pid) kullanılarak proses grubunu toptan sonlandırırız.
 */
function killPidTree(pid: number) {
  if (process.platform === "win32") {
    try { execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { timeout: 5000 }, () => { }); } catch { }
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch { }
    try { process.kill(pid, "SIGTERM"); } catch { }
  }
}

async function discoverCapabilities() {
  const capabilities: string[] = [];
  try { const { stdout } = await execFileAsync("claude", ["--version"]); if (stdout.trim()) capabilities.push("claude"); } catch { }
  try { const { stdout } = await execFileAsync("opencode", ["--version"]); if (stdout.trim()) capabilities.push("opencode"); } catch { }
  try { const { stdout } = await execFileAsync("gemini", ["--version"]); if (stdout.trim()) capabilities.push("gemini"); } catch { }

  return capabilities;
}

function loadOrCreateWorkerId(): string {
  const idArg = process.argv.find(a => a.startsWith("--id="));
  if (idArg) return idArg.substring(5).trim();

  const envFilePath = path.resolve(__server_dirname, "..", ".env");
  let workerId = "";
  if (fs.existsSync(envFilePath)) {
    const content = fs.readFileSync(envFilePath, "utf8");
    const match = content.match(/^WORKER_ID=(.*)$/m);
    if (match) workerId = match[1].trim();
  }
  if (!workerId) {
    workerId = "worker-" + randomUUID();
    fs.appendFileSync(envFilePath, `\nWORKER_ID=${workerId}\n`);
    console.log(`[Worker] Generated new signature: ${workerId}`);
  }
  return workerId;
}

function setupMasterConnection(workerId: string, capabilities: string[]): Socket {
  const masterUrl = process.env.MASTER_URL || "ws://127.0.0.1:8787";
  console.log(`[Worker] Handshaking Master socket: ${masterUrl}`);

  const socket = io(masterUrl, {
    query: {
      workerId,
      capabilities: JSON.stringify(capabilities),
      capacity: String(WORKER_ASSIGNED_CAPACITY),
      requestedCapacity: String(WORKER_REQUESTED_CAPACITY),
      roles: process.env.WORKER_ROLES || '["planner", "coder", "reviewer", "tester"]'
    }
  });

  socket.on("connect", () => {
    console.log(`[Worker] Fleet connection established [Alias: ${workerId} | Socket: ${socket.id}]`);
    socket.emit("worker_echo", `Worker ${workerId} is alive and ready to process jobs! (Capabilities: ${capabilities.join(", ")})`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Worker] Disconnected from Master node [Reason: ${reason}]`);
  });

  return socket;
}

async function prepareGitWorkspace(repo: any, slot: number, isolatedLabel: string, socket: Socket, cardId: string): Promise<string> {
  const projectsDir = path.resolve(process.cwd(), "projects", isolatedLabel);
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });

  const targetDir = path.join(projectsDir, repo.name);

  try {
    if (!fs.existsSync(targetDir)) {
      console.log(`[Worker - Slot ${slot}] Git target missing. Cloning ${repo.gitUrl} -> ${targetDir}...`);
      await execAsync(`git clone ${repo.gitUrl} ${repo.name}`, { cwd: projectsDir });
    } else {
      console.log(`[Worker - Slot ${slot}] Git target exists. Pulling latest commits...`);
      await execAsync(`git fetch --all && git reset --hard origin/main`, { cwd: targetDir });
    }
    await execAsync(`git config user.name "Orkestro Agent" && git config user.email "agent@orkestro.io"`, { cwd: targetDir });
    await execAsync(`git checkout main || true`, { cwd: targetDir });
  } catch (e: any) {
    console.error(`[Worker - Slot ${slot}] FATAL: Git sync collapsed on ${repo.name} - ${e.message}`);
    socket.emit("job_log", { cardId, author: "system", message: `Worker Git checkout failed: ${e.message}` });
    throw e;
  }
  return targetDir;
}

function extractPlannerTasks(fullOutputBuffer: string): any[] | null {
  /**
   * AI Context:
   * Yapay zekalar non-deterministik çıktılar üretebildiği için her zaman saf JSON dönmeyebilirler.
   * Sistemin direncini artırmak için sırasıyla 3 aşamalı Fallback (yedek) regex Regex çıkarma mekanizması çalışır:
   * 1. JSON_TASKS_START özel etiketi aranır.
   * 2. Bulunamazsa Markdown JSON bloğu (```json) aranır
   * 3. Hiçbiri yoksa ham JSON Array [...] motifi parse edilir.
   */
  let jsonStr = "";
  const customMatch = fullOutputBuffer.match(/\[JSON_TASKS_START\]([\s\S]*?)\[JSON_TASKS_END\]/);
  if (customMatch && customMatch[1]) {
    jsonStr = customMatch[1].trim();
  } else {
    const mdMatch = fullOutputBuffer.match(/```json\s*([\s\S]*?)\s*```/);
    if (mdMatch && mdMatch[1]) {
      jsonStr = mdMatch[1].trim();
    } else {
      const arrayMatch = fullOutputBuffer.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch && arrayMatch[0]) {
        jsonStr = arrayMatch[0].trim();
      }
    }
  }

  if (jsonStr) {
    try {
      const tasksArray = JSON.parse(jsonStr);
      if (Array.isArray(tasksArray) && tasksArray.length > 0) {
        return tasksArray;
      }
    } catch (e: any) {
      console.error("[Worker] Failed to parse Planner JSON block!", e.message);
    }
  }
  return null;
}

async function spawnAgentProcess(
  jobData: any,
  projectPath: string,
  socket: Socket,
  jobIdentifier: string,
  finalPrompt: string
): Promise<{ code: number | null, outputBuffer: string }> {

  return new Promise((resolve, reject) => {
    const { cardId, args } = jobData;
    const child = spawn(args[0], args.slice(1), {
      cwd: projectPath,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    activeProcesses.set(jobIdentifier, child);

    child.on("error", (err) => {
      socket.emit("job_log", { cardId, chunk: `\n[Worker] SPAWN ERROR: ${err.message}\n` });
      activeProcesses.delete(jobIdentifier);
      reject(err);
    });

    if (child.stdin) {
      child.stdin.write(finalPrompt);
      child.stdin.end();
    }

    const simplifier = new JsonLogSimplifier();
    if (child.stdout) child.stdout.pipe(simplifier);
    if (child.stderr) child.stderr.pipe(simplifier);

    let fullOutputBuffer = "";
    simplifier.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      socket.emit("job_log", { cardId, chunk: text });
      fullOutputBuffer += text;
    });

    child.on("close", (code) => {
      activeProcesses.delete(jobIdentifier);
      resolve({ code, outputBuffer: fullOutputBuffer });
    });
  });
}

async function startWorker() {
  console.log("[Worker] Bootstrapping subsystem. Discovering native OS capabilities...");
  const capabilities = await discoverCapabilities();

  if (capabilities.length === 0) {
    console.error("FATAL: No AI agents (claude, opencode, gemini) discovered. Refusing connection.");
    process.exit(1);
  }

  console.log(`[Worker] Discovered capabilities: [${capabilities.join(", ")}]`);
  const workerId = loadOrCreateWorkerId();
  const socket = setupMasterConnection(workerId, capabilities);

  let workerPersonas: any[] = [];

  socket.on("master_command", (payload: { action: string }) => {
    console.log(`[Worker] Received remote fleet command: ${payload.action}`);
    if (payload.action === "disconnect") {
      if (process.env.pm_id) {
        console.log(`[Worker] Halting local PM2 instance: ${process.env.pm_id}`);
        execFile("npx", ["pm2", "stop", process.env.pm_id], () => { });
      } else {
        process.exit(0);
      }
    } else if (payload.action === "reconnect") {
      (socket.io.opts.query as any).preserve_personas = workerPersonas.length > 0 ? workerPersonas.map(p => p.id).join(",") : "true";
      socket.disconnect();
      setTimeout(() => socket.connect(), 1000);
    } else if (payload.action === "reroll") {
      (socket.io.opts.query as any).preserve_personas = "false";
      socket.disconnect();
      setTimeout(() => socket.connect(), 1000);
    }
  });

  socket.on("assigned_personas", (personas: any[]) => {
    workerPersonas = personas;
    const names = personas.map(p => p.name).join(", ");
    console.log(`[Worker] Persona link established. Identity adopted: [${names}]`);
  });

  socket.on("kill_job", ({ cardId }) => {
    for (const key of [cardId, `${cardId}_review`]) {
      const child = activeProcesses.get(key);
      if (child && child.pid) {
        console.log(`[Worker] External STOP signal received for job ${key}. Terminating tree ${child.pid}...`);
        killPidTree(child.pid);
        activeProcesses.delete(key);
      }
    }
  });

  const queuesToListen = [...capabilities];
  try {
    const workerRoles = JSON.parse(process.env.WORKER_ROLES || '["coder"]');
    if (workerRoles.includes("planner") && !queuesToListen.includes("planner")) {
      queuesToListen.push("planner");
    }
  } catch (e) { }

  for (const agent of queuesToListen) {
    const queueName = `fleet-${agent}`;
    console.log(`[Worker] Listening on BullMQ Queue: ${queueName}`);

    new Worker(queueName, async (job) => {
      const { cardId, prompt, projectPath: rawProjectPath, isReview, repo, role } = job.data;
      const jobIdentifier = isReview ? `${cardId}_review` : cardId;

      let projectPath = rawProjectPath;
      const workerCapacity = WORKER_ASSIGNED_CAPACITY;
      const slot = await waitAndAcquireSlot(workerCapacity);

      let finalPrompt = prompt;
      let targetRole = isReview ? "reviewer" : role;
      let searchRole = targetRole || "coder";
      if (searchRole === "frontend" || searchRole === "backend") searchRole = "coder";

      const myPersona = workerPersonas.find(p => p.role === searchRole && !p.is_busy) ||
        workerPersonas.find(p => p.role === searchRole) ||
        workerPersonas.find(p => !p.is_busy) ||
        workerPersonas[0];

      if (myPersona) {
        myPersona.is_busy = true;
        socket.emit("persona_busy", { personaId: myPersona.id, isBusy: true, jobId: jobIdentifier });
        console.log(`[Worker - Slot ${slot}] Adopting Persona context: ${myPersona.name} (${myPersona.role})`);
        finalPrompt = `### SYSTEM PERSONA ###\n${myPersona.prompt}\n\n### TASK INSTRUCTIONS ###\n${prompt}`;
      }

      const releasePersona = () => {
        if (myPersona) {
          myPersona.is_busy = false;
          socket.emit("persona_busy", { personaId: myPersona.id, isBusy: false, jobId: null });
        }
      };

      try {
        const isolatedLabel = myPersona ? myPersona.id : `${workerId}-${slot}-${jobIdentifier}`;

        // 1. Repo hazırlığı (Dışarı çıkarılan fonksiyon)
        if (repo && repo.gitUrl && repo.name) {
          projectPath = await prepareGitWorkspace(repo, slot, isolatedLabel, socket, cardId);
        }

        console.log(`[Worker - Slot ${slot}] Sourced job: ${jobIdentifier} (${agent}). Executing natively...`);

        // 2. Ajanın terminalde çalıştırılması (Dışarı çıkarılan fonksiyon)
        const { code, outputBuffer } = await spawnAgentProcess(job.data, projectPath, socket, jobIdentifier, finalPrompt);

        // 3. Planner Parse İşlemleri (Dışarı çıkarılan fonksiyon)
        if (targetRole === 'planner' && code === 0) {
          console.log(`[Worker] Planner finished. Parsing JSON tasks...`);
          const tasks = extractPlannerTasks(outputBuffer);
          if (tasks) {
            console.log(`[Worker] Parsed ${tasks.length} tasks from Planner. Emitting to Master...`);
            socket.emit("planner_generated_tasks", { parentId: job.id, tasks });
          } else {
            console.log("[Worker] No valid JSON task block found in Planner output.");
          }
        }

        socket.emit("job_log", { cardId, author: "system", message: `\n[Local Agent Exit] code ${code}` });
        socket.emit("job_complete", { cardId, exitCode: code ?? 1, projectPath, isReview });

        if (code !== 0) throw new Error(`Agent exited with code ${code}`);

      } catch (err: any) {
        console.error(`[Worker - Slot ${slot}] Job Flow Error:`, err.message);
        throw err;
      } finally {
        releasePersona();
        releaseSlot(slot);
      }

    }, {
      connection: connection as any,
      concurrency: WORKER_ASSIGNED_CAPACITY,
      lockDuration: 120000
    });
  }
}

startWorker().catch(console.error);
