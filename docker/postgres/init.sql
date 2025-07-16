-- Initialize QualGen database
CREATE DATABASE IF NOT EXISTS qualgen;

-- Switch to the database
\c qualgen;

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create initial tables will be created by the application migration
