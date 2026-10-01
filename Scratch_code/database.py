import sqlite3
import os
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'chatbot.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        persona TEXT DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    ''')

    conn.commit()
    conn.close()

def create_conversation(persona='general', title='New Conversation'):
    conv_id = str(uuid.uuid4())[:8]
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    INSERT INTO conversations (id, title, persona)
    VALUES (?, ?, ?)
    ''', (conv_id, title, persona))
    conn.commit()
    
    cursor.execute('SELECT * FROM conversations WHERE id = ?', (conv_id,))
    conv = dict(cursor.fetchone())
    conn.close()
    return conv

def get_conversations():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT 
        c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message
    FROM conversations c
    ORDER BY c.updated_at DESC
    ''')
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_conversation_with_messages(conv_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM conversations WHERE id = ?', (conv_id,))
    conv_row = cursor.fetchone()
    if not conv_row:
        conn.close()
        return None

    cursor.execute('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC', (conv_id,))
    messages = [dict(r) for r in cursor.fetchall()]
    conn.close()

    res = dict(conv_row)
    res['messages'] = messages
    return res

def add_message(conv_id, role, content):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    INSERT INTO messages (conversation_id, role, content)
    VALUES (?, ?, ?)
    ''', (conv_id, role, content))
    msg_id = cursor.lastrowid

    # Update conversation's updated_at timestamp
    cursor.execute('''
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    ''', (conv_id,))

    conn.commit()
    cursor.execute('SELECT * FROM messages WHERE id = ?', (msg_id,))
    msg = dict(cursor.fetchone())
    conn.close()
    return msg

def update_conversation_title(conv_id, title):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (title, conv_id))
    conn.commit()
    conn.close()

def delete_conversation(conv_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conv_id,))
    cursor.execute('DELETE FROM conversations WHERE id = ?', (conv_id,))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Chatbot database initialized.")
