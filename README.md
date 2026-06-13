# AgenticTribunal ⚖️
## LLM Multi-Agent Debate Arena (v3.5.0 — Persistent Actor Archives & Human-in-the-Loop)

AgenticTribunal is a high-fidelity, adversarial multi-agent debate and legal institutional simulation. By isolating agents in sequential sessions and leveraging a professional prompt compiler, the system breaks the boundaries of traditional single-threaded LLM biases, logical echo chambers, and context-poisoning loops.

With **Version 3.5**, AgenticTribunal introduces a robust **Human-in-the-Loop Deliberation Workspace**, allowing a human trial supervisor or user to act as a permanent seated juror with direct routing, quote promotion, targeted auditing, and live sentiment-sway tracking.

---

## 🎯 Institutional Framework
When querying complex concepts using individual LLMs, outputs often suffer from self-reinforcing biases or flat justifications. AgenticTribunal counters this by instituting a structured, adversarial deliberation structure:

1. **The Defender Attorney (Advocate):** Focuses exclusively on building a robust, logical, and evidence-driven case in favor of the core claim.
2. **The Prosecuting Attorney (Critic):** Identifies hidden assumptions, logical fallacies, systemic vulnerabilities, and structural weaknesses in the Defender's case.
3. **The Chief Presiding Judge (Synthesis):** Resolves contradictions, monitors logical integrity, provides interim feedback guidance, and delivers a rigorous, objective final synthesis and verdict.
4. **The Seated Citizen Jury (Empirical Sway Tracker):** A fully customizable group of non-expert citizens with unique professional biases (e.g., Forensic Accountant, UX Designer, Carpenter) who measure real-world message clarity.
5. **The Human Juror Panel (Permanent seat):** Your direct live notes, active conviction ratings, feedback directives, and targeted audit logs are directly compiled into active dialogue.

---

## 🛡️ Statutory Specialist Extensions
To enrich the core debate pathway, users can activate optional specialist audit extensions that evaluate raw dialog records with neutral, isolated benchmarks:

* **Evidence Clerk:** Classifies significant claims using rigorous evidence grading levels (**Established**, **Strongly Supported**, **Plausible**, **Speculative**, **Unsupported**, **Contradicted**) without taking advocacy sides.
* **Scientific Judge:** Focuses strictly on physical laws, empirical rigor, and validation boundaries.
* **Ethical Judge:** Probes issues of moral weight, accessibility barriers, and distributive justice.
* **Practical Judge:** Studies implementation speed, financial costs, operational overhead, and maintenance lifecycles.
* **Contrarian Auditor:** Exposes unstated consensus biases by generating radical counter-theories and contrary reasoning models.

---

## 🚀 Key Innovations in Version 3.5

### 1. Juror Chambers & Workspace (Self-Reflection Loops)
* **Permanent Juror Seat:** Actively observe trials and insert direct remarks.
* **Active Conviction Ratio Slider:** Dynamically shift your conviction percentage (0–100%) between **🛡️ Defendant** and **Prosecutor ⚔️**. Your current bias controls the simulated sentiments and metrics of the jury panel.
* **Court Reflective Triggers:** Quick-shortcut buttons allow inserting structured evaluation filters (e.g., *Overlooked Risks* and *Empirical Check*) into your draft notes to steer AI deliberations.

### 2. Highlight Promotion Suite
Copy and promote critical passages stated by any speaking actor directly to the **Structured Institutional Record** handled by the Clerk of the Court. You can tag quotes into categories:
* 📌 **Key Fact**
* ⚠️ **Key Objection**
* 📁 **Important Evidence**
* 🧩 **Hidden Assumption**
* 🔧 **Practical Concern**
* ❤️ **Ethical Concern**
* ❓ **Unresolved Question**

*These high-weight artifacts are permanently integrated into the core transcript layers of all subsequently running turns.*

### 3. Targeted Drill-Down Flags (Multi-Agent Routing)
Flag and direct specific dialogue excerpts to a designated agent (e.g., prosecutor or a practical judge). The system injects a targeted instruction forcing that specific actor to review, audit, defend, or reconcile the selected stance during their next speaking step.

### 4. Actor Turn Log Viewer & Preservations
Open the **Log Drawer** on any active actor to inspect their historical speech outputs, word count metrics, and compression settings.
* **"Never Compress" Passages:** Mark highly specific text passages to stay entirely raw during memory-truncation thresholds, protecting core evidence from degradation.

### 5. Automated Multi-Stage Memory Compression
An interactive slider permits memory compression limits ranging from 2,000 to 20,000 words. When live debate transcripts cross your chosen limit:
* The core LLM context is restricted to structured abstract records and syntheses.
* This isolates institutional history, preventing contextual poisoning and chat-loop degradation.

### 6. Interactive Minority Concern Reports
If you raise concerns that aren't fully resolved by adversarial attorneys, the Clerk of the Court automatically evaluates your text, publishing official **Minority Concern Alerts**:
* **Observation:** The direct human concern compiled.
* **Addressing Actors:** Auto-classification of which agents responded to the point.
* **Unresolved Gaps:** Critical documentation of failures by the team to satisfy the issue.
* **Verdict Recommendation:** Clerk procedural next-steps.

---

## 🎨 Visual Identity & Theme
Styled using the **Professional Polish (Indigo Slate Edition)** theme, the client workspace maximizes readable screen real-estate with functional structural density:
* **Slate-100 Canvas base** matched with high-contrast, clean Indigo and Velvet accents for executive professionalism.
* **Dual-Column layout** separating system configurations and parameters cleanly from interactive runtime feed elements.
* **Granular Actor Settings Ribbon:** Inline switches directly in cards to adjust model selection, custom temperature, and toggle individual agent inclusion.
* **Automated & Manual step controls** allowing developers to play through sequential workflows in real-time or examine step changes one-by-one.

---

## ⚙️ Technical Architecture & Well Isolation

```
                   +--------------------------+
                   |    Client UI Frontend    |
                   +-------+----------+-------+
                             |          ^
   1. Generate System       |          |  4. Live UI Sway &
      Prompts Request       v          |     Dialogue Update
                     +-------+----------+-------+
                     |  Express-Vite API Proxy  |
                     +-------+----------+-------+
                             |          ^
      2. Isolated Session    |          |  3. Clean text reply
         State Transcript    v          |     (No contamination)
                     +-------+----------+-------+
                     |     Gemini / Local LLM   |
                     +--------------------------+
```

### Avoiding Context Poisoning:
If all agents share one massive chat history container, they will inevitably adapt to other identities, lose their distinct guidelines, or become "too agreeable" (context poisoning). 
The system enforces **isolated sequential sessions**:
* Before any agent takes a turn, their specific **System Instructions** and a compiled read-only **Transcript Log** of past messages are bundled together.
* This complete package is sent as a brand new, stateless single-turn transaction to the server-side proxy endpoint.
* Once the prompt completes, the response is captured, parsed, and logged inside the master frontend session store, keeping private context memory absolutely immaculate.

### Dual-Provider Capability:
* **Gemini AI Core Engine:** Robust, server-isolated API proxying keeping keys safely away from user inspection.
* **Ollama Interface Integration:** Directly queries local engines like `llama3.1` or `mistral`. Features explicit troubleshooting documentation for bypassing browser sandboxed CORS configurations.

---

## 💻 Local Installation & Setup

Follow these instructions to download, install, configure, and run AgenticTribunal on your local development machine.

### Prerequisites
* **Node.js**: Version 18.x or above
* **npm**: Version 9.x or above (comes bundled with Node.js)
* **Local LLM Engine (Optional)**: [Ollama](https://ollama.com) if you wish to run completely local offline debates.

### 1. Clone the Repository & Install Dependencies
Download or clone this repository to your local system, navigate inside the project directory, and install the required npm packages:

```bash
# Navigate to the workspace directory
cd AgenticTribunal

# Install required dependencies
npm install
```

### 2. Configure Environment Variables
The application utilizes server-side proxying to protect your Gemini API keys and secrets. 

1. Copy the `.env.example` file to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in your text editor and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

### 3. Run the Development Server
AgenticTribunal runs as a full-stack application (Express backend + Vite-powered React client). Start the development workspace using the following command:

```bash
npm run dev
```

The Express-Vite proxy server will boot and listen on **port 3000**:
* Open your browser and navigate to: **`http://localhost:3000`**

### 4. Build for Production & Execution
To compile the absolute fastest, bundled, and optimized production bundle:

```bash
# Compile client assets and bundle backend via esbuild
npm run build

# Start the compiled self-contained server in standalone mode
npm run start
```

---

## 🦙 Unleashing Local Models: Ollama Integration

AgenticTribunal fully supports local models like `llama3`, `llama3.1`, `mistral`, `gemma2`, or `phi3`.

### 🚨 Crucial: Resolving local CORS and Mixed Content Blocks

To let your browser and Express server connect with your local Ollama engine:

#### 1. Enable Ollama CORS (All Environments)
By default, browser-direct API queries are blocked by Ollama's default security rules. Launch Ollama with the wildcard origin value enabled:

* **macOS**:
  ```bash
  OLLAMA_ORIGINS="*" ollama serve
  ```
* **Windows (Command Prompt / PowerShell)**:
  ```cmd
  set OLLAMA_ORIGINS=*
  ollama serve
  ```
* **Linux**:
  Edit your systemd configuration file for Ollama (`/etc/systemd/system/ollama.service`) to add:
  ```ini
  [Service]
  Environment="OLLAMA_ORIGINS=*"
  ```
  Then reload systemd and restart Ollama:
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl restart ollama
  ```

#### 2. Resolving HTTPS-to-HTTP Private Network Restrictions
If you are running the application over HTTPS (such as inside our AI Studio Preview) and attempt to query local HTTP private IPs (e.g. `http://localhost:11434` or `http://127.0.0.1:11434`), your browser will block the request under **Insecure Mixed Content** rules.

AgenticTribunal handles this gracefully with two built-in fallback modes:
* **Client-Direct Fallback**: Displays clear, browser-specific unlocking instructions. To allow local queries, simply click the site security lock icon in your browser address bar next to the preview URL, open **Site Settings**, locate **Insecure Content**, and select **Allow**.
* **Tunnel Exposing (Highly Recommended)**: Securely expose your local Ollama port via a tool like [ngrok](https://ngrok.com) or [localtunnel](https://github.com/localtunnel/localtunnel) to get an HTTPS proxy URL:
  ```bash
  ngrok http 11434
  ```
  Simply copy the generated `https://...` address and paste it directly into the AgenticTribunal **Provider URL** input field.
