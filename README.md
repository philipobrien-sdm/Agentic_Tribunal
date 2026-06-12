# AgenticTribunal ⚖️
## LLM Multi-Agent Debate Arena (v2.0.0 — Heterogeneous Institutions)

AgenticTribunal is a powerful, production-ready React application engineered to orchestrate high-fidelity, adversarial multi-agent debate workflows. By isolating agents in sequential sessions and leveraging a professional-grade prompt compiler, the system breaks the boundaries of typical single-threaded LLM biases, logical echo chambers, and context-poisoning loops.

With **Version 2.0**, AgenticTribunal transitions to a fully heterogeneous multi-model architecture, where each actor in the institution can independently use different models and parameters discoverable dynamically from local or cloud servers. NOTE: At this time, all elements work with local LLM implementations except the initial system  prompt generation 
<img width="1327" height="785" alt="Screenshot 2026-06-12 204125" src="https://github.com/user-attachments/assets/e04d49b0-580e-4190-8b4a-17c2ab51b84e" />

---

## 🎯 Project Core Purpose
When querying complex concepts using individual LLMs, outputs often suffer from self-reinforcing biases or flat justifications. AgenticTribunal counters this by instituting a structured, adversarial deliberation structure:

<img width="850" height="628" alt="Screenshot 2026-06-12 215903" src="https://github.com/user-attachments/assets/183dd4d0-7e51-4faa-934e-b18c5c239341" />

1. **The Defender Attorney (Advocate):** Focuses exclusively on building a robust, logical, and evidence-driven case in favor of the core claim.
2. **The Prosecuting Attorney (Critic):** Identifies hidden assumptions, logical fallacies, systemic vulnerabilities, and structural weaknesses in the Defender's case.
3. **The Chief Presiding Judge (Synthesis):** Resolves contradictions, monitors logical integrity, provides interim feedback guidance, and delivers a rigorous, objective final synthesis and verdict.
4. **The Seated Citizen Jury (Empirical Sway Tracker):** A fully customizable group of non-expert citizens with unique professional biases (e.g., Forensic Accountant, UX Designer, Carpenter) who measure real-world message clarity.
<img width="211" height="305" alt="Screenshot 2026-06-12 210727" src="https://github.com/user-attachments/assets/70a05692-0124-419d-b3a0-068de9ff3d33" />

---

## 🛡️ Statutory Specialist Extensions
To enrich the core debate pathway, users can activate optional specialist audit extensions that evaluate raw dialog records with neutral, isolated benchmarks:

* **Evidence Clerk:** Classifies significant claims using rigorous evidence grading levels (**Established**, **Strongly Supported**, **Plausible**, **Speculative**, **Unsupported**, **Contradicted**) without taking advocacy sides.
* **Scientific Judge:** Focuses strictly on physical laws, empirical rigor, and validation boundaries.
* **Ethical Judge:** Probes issues of moral weight, accessibility barriers, and distributive justice.
* **Practical Judge:** Studies implementation speed, financial costs, operational overhead, and maintenance lifecycles.
* **Contrarian Auditor:** Exposes unstated consensus biases by generating radical counter-theories and contrary reasoning models.

---

## 🎨 Visual Identity & Theme
Styled using the **Professional Polish (Indigo Slate Edition)** theme, the client workspace maximizes readable screen real-estate with functional structural density:
* **Slate-100 Canvas base** matched with high-contrast, clean Indigo and Velvet accents for executive professionalism.
* **Dual-Column layout** separating system configurations and parameters cleanly from interactive runtime feed elements.
* **Granular Actor Settings Ribbon:** Inline switches directly in cards to adjust model selection, custom temperature, and toggle individual agent inclusion.
* **Automated & Manual step controls** allowing developers to play through sequential workflows in real-time or examine step changes one-by-one.

---

## 🚀 Key Features in Version 2.1

### 1. Dynamic Debate Round Configurator (1 to 5 Rounds)
Users can seamlessly customize argument length via the dynamic rounds slider in the **Tribunal Constraints Panel**, scaling the entire debate structure dynamically from 1 to 5 rounds.

### 2. Double-Blind Isolation Architecture
To eliminate first-mover advantages, Defendant and Prosecutor arguments are processed securely in parallel. They cannot inspect each other's current contemporaneous draft or refinement responses—only neutral round synopses and finished messages from previous rounds are visible.

### 3. Context Compression & Smart Summarization
At the close of each debate round, a dedicated neutral LLM processor automatically digests the entire raw debate dialogue of that round, producing a precise consolidated synthesis. By passing ONLY these condensed round summaries into subsequent rounds, the system prevents massive prompt bloated context window memory and avoids browser-clipping.

### 4. Response Size Limits Slider
An interactive slider allows users to control model word limit counts (ranging from 200 up to 2500 words). The constraint is dynamically enforced server-side and client-side, ensuring complete, structured outputs that conclude naturally without getting arbitrarily trimmed.

### 5. Seated Jury Advisory Toggle (No-Decide Power)
The jury strictly acts as an advisory panel that highlights critical logical inconsistencies, hidden loopholes, or biases directly to the Chief Presiding Judge. The decision responsibility rests completely with the Judge. Users can toggle whether the Jury critiques dynamically after each round, or performs a single-pass review of the final arguments.

### 6. Heterogeneous Model Assignment
Actors are no longer tied to one global default LLM. The system discovers available cloud and local Ollama server models dynamically, exposing dropdown overrides and precise temperature sliders on the active panels. This allows you to combine high-capacity reasoning models (like Gemini 2.5 Pro) with ultra-fast local completions models seamlessly.

### 7. Fully Customizable Jurors
A dynamic customization framework enables you to construct a bespoke citizen jury. You can add, edit names, select a profession preset from our curated pool, select custom models, and configure temperatures to measure the clarity of complex claims across highly specific customer or audience contexts.

### 8. Real-Time Minority Reports
When the seated jury splits its leans, AgenticTribunal automatically calculates and compiles a highlighted **Minority Report** card. It displays dissenting opinions, quotes from the dissenting transcript, and details why certain jurors remain unpersuaded, preserving intellectual diversity.

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
