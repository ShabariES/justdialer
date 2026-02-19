-- Create users table in Supabase SQL Editor
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rollno TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    socket_id TEXT,
    online BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster lookups
CREATE INDEX idx_users_rollno ON users(rollno);
