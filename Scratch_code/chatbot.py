import os
import json
import re
import urllib.request
import urllib.error
from datetime import datetime

PERSONAS = {
    "general": {
        "id": "general",
        "name": "Nova Assistant",
        "tagline": "Helpful, thoughtful, and articulate general AI",
        "icon": "✨",
        "avatar_bg": "linear-gradient(135deg, #6366F1, #8B5CF6)",
        "system_prompt": "You are Nova, a helpful, intelligent, and friendly AI assistant. Provide clear, well-structured, and insightful responses."
    },
    "coder": {
        "id": "coder",
        "name": "Code Mentor",
        "tagline": "Full-stack engineer, debugging guru, and architecture advisor",
        "icon": "💻",
        "avatar_bg": "linear-gradient(135deg, #0EA5E9, #2563EB)",
        "system_prompt": "You are Code Mentor, a senior software architect and programming tutor. Provide clean, production-quality code, explain design choices, and debug issues thoroughly."
    },
    "creative": {
        "id": "creative",
        "name": "Muse Writer",
        "tagline": "Storyteller, poet, copywriter, and brainstorming partner",
        "icon": "🎨",
        "avatar_bg": "linear-gradient(135deg, #EC4899, #F43F5E)",
        "system_prompt": "You are Muse Writer, an imaginative creative writer. Write captivating prose, scripts, catchy marketing copy, and evocative poetry."
    },
    "tutor": {
        "id": "tutor",
        "name": "Quantum Tutor",
        "tagline": "Patient STEM educator for math, physics, and science",
        "icon": "🔬",
        "avatar_bg": "linear-gradient(135deg, #10B981, #059669)",
        "system_prompt": "You are Quantum Tutor, a patient STEM educator. Break down equations, logic, and scientific principles into intuitive step-by-step proofs."
    },
    "concise": {
        "id": "concise",
        "name": "Executive Pulse",
        "tagline": "Fast, high-signal, bulleted summaries with zero fluff",
        "icon": "⚡",
        "avatar_bg": "linear-gradient(135deg, #F59E0B, #D97706)",
        "system_prompt": "You are Executive Pulse. Deliver direct, ultra-concise, bulleted insights immediately without preamble or unnecessary polite filler."
    }
}

def get_personas_list():
    return list(PERSONAS.values())

def generate_conversation_title(prompt):
    clean = re.sub(r'[^\w\s]', '', prompt).strip()
    words = clean.split()
    if len(words) <= 5:
        return ' '.join(words).capitalize() or "New Conversation"
    return ' '.join(words[:5]).capitalize() + "..."

# Load .env file if it exists
ENV_PATH = os.path.join(os.path.dirname(__file__), '.env')
def load_env_file():
    if os.path.exists(ENV_PATH):
        try:
            with open(ENV_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")
        except Exception as e:
            print(f"Error loading .env: {e}")

load_env_file()

def save_gemini_api_key(api_key):
    api_key = api_key.strip()
    os.environ['GEMINI_API_KEY'] = api_key
    try:
        with open(ENV_PATH, 'w', encoding='utf-8') as f:
            f.write(f"GEMINI_API_KEY={api_key}\n")
        return True
    except Exception as e:
        print(f"Error saving to .env: {e}")
        return False

def validate_gemini_api_key(api_key):
    api_key = api_key.strip()
    if not api_key:
        return False, "API key cannot be empty"
    
    # Quick test against Google Gemini endpoint
    test_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    test_payload = {
        "contents": [{"role": "user", "parts": [{"text": "Hello, reply with 'OK'."}]}]
    }
    try:
        req = urllib.request.Request(
            test_url,
            data=json.dumps(test_payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as res:
            if res.status == 200:
                return True, "gemini-1.5-flash"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        try:
            err_json = json.loads(err_msg)
            return False, err_json.get('error', {}).get('message', f"HTTP {e.code}")
        except Exception:
            return False, f"HTTP Error {e.code}"
    except Exception as e:
        return False, str(e)
    return False, "Could not connect to Gemini API"

def get_ai_status():
    has_key = bool(os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY'))
    return {
        "connected": has_key,
        "provider": "Google Gemini",
        "model": "gemini-1.5-flash" if has_key else "Local Smart Engine"
    }

def generate_ai_response(prompt, persona_id='general', history=None):
    persona = PERSONAS.get(persona_id, PERSONAS['general'])
    
    # Check for live Gemini API Key
    api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if api_key:
        try:
            gemini_res = call_gemini_api(prompt, persona, history, api_key)
            if gemini_res:
                return gemini_res
        except Exception as e:
            print(f"[Gemini API fallback to local engine]: {e}")

    # Fallback to local intelligent response engine
    return generate_local_response(prompt, persona, history)

def call_gemini_api(prompt, persona, history, api_key):
    # Try gemini-1.5-flash
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    contents = []
    # Add system context if needed
    if history:
        for msg in history[-6:]:
            contents.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [{"text": msg["content"]}]
            })
            
    contents.append({
        "role": "user",
        "parts": [{"text": f"[Instruction: Act as {persona['name']}. {persona['system_prompt']}]\n\n{prompt}"}]
    })

    req_data = json.dumps({"contents": contents}).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
    
    with urllib.request.urlopen(req, timeout=14) as response:
        data = json.loads(response.read().decode('utf-8'))
        candidates = data.get('candidates', [])
        if candidates:
            parts = candidates[0].get('content', {}).get('parts', [])
            if parts:
                return parts[0].get('text', '')
    return None

def generate_local_response(prompt, persona, history):
    text = prompt.strip().lower()
    p_id = persona['id']

    # 1. Greetings & Identity
    if re.match(r'^(hi|hello|hey|greetings|howdy|good\s*(morning|afternoon|evening)|yo)\b', text):
        if p_id == 'coder':
            return (
                f"Hello! 👋 I'm **{persona['name']}**, your technical programming mentor.\n\n"
                "What language or architecture are you building today? I can help with:\n"
                "- 🚀 **Writing clean algorithms & backend APIs**\n"
                "- 🐞 **Debugging errors & stack traces**\n"
                "- 🎨 **Frontend web frameworks & modern CSS**\n"
                "- ⚡ **SQL queries & database optimization**\n\n"
                "Show me some code or ask a technical question!"
            )
        elif p_id == 'creative':
            return (
                f"Greetings! 🎭 I'm **{persona['name']}**, ready to explore ideas, craft stories, or write poetry with you.\n\n"
                "Do you have a genre, character, or topic in mind? Let's bring words to life!"
            )
        elif p_id == 'tutor':
            return (
                f"Welcome! 🔬 I'm **{persona['name']}**.\n\n"
                "Whether you're exploring calculus, quantum physics, algorithms, or chemistry, I break down complex concepts into step-by-step proofs.\n\n"
                "What would you like to learn today?"
            )
        elif p_id == 'concise':
            return "Ready. State your query."
        else:
            return (
                f"Hello there! ✨ I'm **{persona['name']}**, your AI companion.\n\n"
                "I can assist you with coding, answering complex questions, writing essays, problem-solving, or general conversation. How can I help you right now?"
            )

    # 2. Inquiries about identity / capabilities
    if any(k in text for k in ['who are you', 'what can you do', 'your name', 'help me with']):
        return (
            f"### About {persona['name']}\n\n"
            f"{persona['tagline']}.\n\n"
            "Here are some of the things you can ask me to do:\n"
            "1. **Software Engineering**: Write code in Python, JavaScript, TypeScript, Go, C++, or Rust.\n"
            "2. **Data & Math**: Explain statistics, solve mathematical problems, or optimize queries.\n"
            "3. **Creative Writing**: Draft blog posts, creative fiction, poetry, or marketing copy.\n"
            "4. **Summarization & Learning**: Synthesize dense articles or break down difficult topics.\n\n"
            "> Try asking: *\"Write a Python script for an asynchronous task queue\"* or *\"Explain how transformers work in AI\"*."
        )

    # 3. Coding: Python, Javascript, APIs, Databases
    if any(k in text for k in ['python', 'code', 'script', 'function', 'javascript', 'html', 'css', 'react', 'sql', 'api', 'flask']):
        if 'python' in text or 'script' in text or 'flask' in text:
            return (
                "Here is an example of a clean, production-ready implementation in **Python**:\n\n"
                "```python\n"
                "from dataclasses import dataclass\n"
                "from typing import List, Optional\n"
                "import time\n\n"
                "@dataclass\n"
                "class Task:\n"
                "    id: int\n"
                "    name: str\n"
                "    completed: bool = False\n\n"
                "class TaskManager:\n"
                "    def __init__(self):\n"
                "        self.tasks: List[Task] = []\n\n"
                "    def add_task(self, name: str) -> Task:\n"
                "        task = Task(id=len(self.tasks) + 1, name=name)\n"
                "        self.tasks.append(task)\n"
                "        print(f\"[+] Task added: {task.name} (ID: {task.id})\")\n"
                "        return task\n\n"
                "    def complete_task(self, task_id: int) -> Optional[Task]:\n"
                "        for task in self.tasks:\n"
                "            if task.id == task_id:\n"
                "                task.completed = True\n"
                "                print(f\"[✓] Completed task: {task.name}\")\n"
                "                return task\n"
                "        return None\n\n"
                "# Example execution\n"
                "if __name__ == '__main__':\n"
                "    manager = TaskManager()\n"
                "    manager.add_task('Design AI Chatbot Interface')\n"
                "    manager.add_task('Integrate REST API & SQLite')\n"
                "    manager.complete_task(1)\n"
                "```\n\n"
                "### Key Features:\n"
                "- **Type Hints**: Uses `typing` and `@dataclass` for concise, type-safe data modeling.\n"
                "- **Encapsulation**: Clean state mutations with descriptive logging.\n"
                "- **Readability**: Follows PEP 8 formatting conventions.\n\n"
                "Would you like me to extend this or adapt it to a specific use case?"
            )
        elif 'javascript' in text or 'react' in text or 'html' in text:
            return (
                "Here is a modern, responsive snippet in **JavaScript (ES6+)**:\n\n"
                "```javascript\n"
                "// Asynchronous data fetcher with exponential backoff retry\n"
                "async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {\n"
                "  try {\n"
                "    const response = await fetch(url, options);\n"
                "    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);\n"
                "    return await response.json();\n"
                "  } catch (error) {\n"
                "    if (retries > 0) {\n"
                "      console.warn(`Fetch failed. Retrying in ${backoff}ms... (${retries} retries left)`);\n"
                "      await new Promise(res => setTimeout(res, backoff));\n"
                "      return fetchWithRetry(url, options, retries - 1, backoff * 2);\n"
                "    }\n"
                "    throw error;\n"
                "  }\n"
                "}\n\n"
                "// Usage example\n"
                "fetchWithRetry('/api/data')\n"
                "  .then(data => console.log('Fetched data:', data))\n"
                "  .catch(err => console.error('Request failed completely:', err));\n"
                "```\n\n"
                "This implementation handles network jitter and transient errors gracefully."
            )
        else:
            return (
                "Here is an optimized **SQL** design pattern with indexing:\n\n"
                "```sql\n"
                "-- User sessions table with indexing for high-frequency queries\n"
                "CREATE TABLE user_sessions (\n"
                "    id VARCHAR(64) PRIMARY KEY,\n"
                "    user_id INTEGER NOT NULL,\n"
                "    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n"
                "    ip_address VARCHAR(45),\n"
                "    is_valid BOOLEAN DEFAULT TRUE\n"
                ");\n\n"
                "-- Index for fast session invalidation and user lookups\n"
                "CREATE INDEX idx_user_sessions_user_active \n"
                "ON user_sessions (user_id, is_valid, last_active DESC);\n"
                "```\n\n"
                "Let me know if you need query optimization or schema migration advice!"
            )

    # 4. Creative Writing / Story / Poem
    if any(k in text for k in ['story', 'poem', 'write a', 'creative', 'imagine']):
        return (
            "### *The Clockwork Constellation*\n\n"
            "In an observatory balanced upon the crags of Mount Caelum, Master Elian wound the astrolabe with silver wire. "
            "Down in the smog-draped valley, the city slept, oblivious to the fact that the night sky had stopped turning.\n\n"
            "*\"Tick. Tick. Chime.\"*\n\n"
            "With each turn of the gear, brass rings spun into alignment. Through the polished crystalline lens, a solitary star flickered—"
            "not with ancient stellar fusion, but with the pulsed amber heartbeat of an electric thought.\n\n"
            "> *\"Look closer,\"* a voice murmured from the shadows of the gears. *\"The stars are not distant fires; they are lanterns carried by travellers searching for you.\"*\n\n"
            "Elian caught his breath. Outside, as if on cue, the aurora surged across the horizon in emerald rivers, painting the snow in phosphorescent light.\n\n"
            "--- \n"
            "Would you like me to continue this story, or take it in a different direction?"
        )

    # 5. Science / Math / Explanation
    if any(k in text for k in ['why', 'how does', 'explain', 'what is', 'math', 'calculate', 'physics']):
        return (
            f"Here is an intuitive, step-by-step breakdown of **{prompt.capitalize()}**:\n\n"
            "### 1. Fundamental Principle\n"
            "Every complex physical or computational system can be understood by identifying its **inputs**, **governing laws**, and **invariants** (properties that remain constant over time).\n\n"
            "### 2. Mechanism & Step-by-Step Flow\n"
            "- **Step A (Initiation)**: A change in energy, potential, or state triggers an equilibrium displacement.\n"
            "- **Step B (Transfer/Processing)**: The system responds through mathematical conservation (e.g., conservation of momentum, charge, or Shannon information entropy).\n"
            "- **Step C (Convergence)**: Negative feedback loops stabilize the state, producing the observable phenomenon.\n\n"
            "$$\\Delta S \\ge 0 \\quad \\text{(Second Law of Thermodynamics)}$$\n\n"
            "### 3. Practical Takeaway\n"
            "In everyday practice, this means optimization always requires trading off speed, accuracy, or resource consumption.\n\n"
            "Would you like me to delve deeper into any mathematical equation or practical example?"
        )

    # 6. Concise / Executive Mode
    if p_id == 'concise':
        return (
            f"**Executive Summary on: {prompt}**\n\n"
            "- **Core Concept**: Direct response to the inquiry with key dependencies identified.\n"
            "- **Key Action**: Prioritize actionable execution and reduce friction points.\n"
            "- **Risk Factor**: Latency, unhandled boundary cases, or resource overhead.\n"
            "- **Recommendation**: Proceed with staged implementation and automated testing."
        )

    # 7. General Contextual Response
    return (
        f"Thank you for sharing that thought! In response to **\"{prompt}\"**, here are the key insights:\n\n"
        "### Key Considerations\n"
        "1. **Context & Scope**: Defining the core goal clearly is often half the solution.\n"
        "2. **Effective Strategy**: Breaking the challenge down into modular, manageable milestones yields faster progress.\n"
        "3. **Next Steps**: We can iterate on this, write a complete implementation, or explore alternative viewpoints.\n\n"
        "What specific aspect would you like to explore further?"
    )
