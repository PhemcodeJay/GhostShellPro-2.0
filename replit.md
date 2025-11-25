# Overview

GhostShell is an Electron-based desktop application that provides a managed browser automation solution with licensing capabilities. The application uses Puppeteer for web automation, includes a license validation system, and supports multiple instance management. It's designed for betting automation with stealth capabilities and network manipulation features.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Electron Framework**: Uses Electron as the main desktop application framework with separate renderer and main processes
- **Multi-Window Design**: Implements both a manager window for instance management and individual instance windows
- **IPC Communication**: Uses Electron's IPC (Inter-Process Communication) for secure communication between renderer and main processes
- **Context Bridge**: Implements contextBridge for secure API exposure to renderer processes

## Backend Architecture
- **Node.js Runtime**: Built on Node.js with modular JavaScript architecture
- **Instance Management**: Centralized instance state management through `instanceStore.js` for handling multiple bot instances
- **Puppeteer Integration**: Uses puppeteer-extra with stealth plugins for browser automation and anti-detection
- **Script Protection**: Implements encrypted script storage with runtime decryption for protecting proprietary automation logic
- **Network Manipulation**: Platform-specific network helper utilities for Windows and macOS to refresh network connections

## Data Storage Solutions
- **File-based Storage**: Uses JSON files stored in Electron's userData directory for instance configurations
- **Encryption**: Implements AES encryption for sensitive data storage including license keys and configurations
- **In-memory State**: Maintains runtime state in memory through the instance store for active sessions

## Authentication and Authorization
- **License Server Integration**: Connects to a remote FastAPI-based license validation server
- **JWT Tokens**: Uses JSON Web Tokens for secure communication with license server
- **Machine Binding**: Implements machine fingerprinting for license validation tied to specific hardware
- **Universal License Support**: Includes support for universal license keys alongside individual licenses

## External Dependencies
- **License Server**: FastAPI-based server hosted on Render for license validation and management
- **PostgreSQL Database**: Used by the license server for storing license information and validation logs
- **Puppeteer**: Core browser automation engine with stealth capabilities
- **Crypto Libraries**: Uses crypto-js and jose for encryption, JWT handling, and security operations
- **Platform Utilities**: Integrates with OS-specific APIs for elevated privileges and network manipulation

# External Dependencies

## Third-party Services
- **Render Platform**: Hosts the license validation server
- **License Validation API**: Remote REST API at `server-license.onrender.com` for license management

## Key Libraries
- **Electron**: Desktop application framework (v38.1.2)
- **Puppeteer**: Browser automation with stealth plugins
- **FastAPI**: License server backend framework
- **PostgreSQL**: Database for license storage via psycopg2-binary
- **Crypto Libraries**: crypto-js for encryption, jose for JWT operations
- **SQLAlchemy**: ORM for license server database operations

## System Dependencies
- **Platform-specific Network Tools**: Uses netsh on Windows and networksetup on macOS for network manipulation
- **Machine ID**: Hardware fingerprinting for license binding
- **Sudo Privileges**: Optional elevated permissions for network operations