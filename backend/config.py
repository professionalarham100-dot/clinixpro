"""
Configuration file for Smart Clinical Management System Backend
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration"""
    DEBUG = False
    TESTING = False
    FLASK_ENV = 'production'
    
    # Database Configuration
    MYSQL_DATABASE_HOST = os.getenv('DB_HOST', 'localhost')
    MYSQL_DATABASE_PORT = int(os.getenv('DB_PORT', 3306))
    MYSQL_DATABASE_USER = os.getenv('DB_USER', 'root')
    MYSQL_DATABASE_PASSWORD = os.getenv('DB_PASSWORD', '')
    MYSQL_DATABASE_DB = os.getenv('DB_NAME', 'smart_clinic')
    
    # CORS Configuration
    CORS_HEADERS = 'Content-Type'
    JSON_SORT_KEYS = False
    
    # Session Configuration
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'
    SESSION_COOKIE_SECURE = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    MYSQL_DATABASE_DB = 'smart_clinic_test'

# Select configuration based on environment
config_name = os.getenv('FLASK_ENV', 'development')
if config_name == 'production':
    config = ProductionConfig
elif config_name == 'testing':
    config = TestingConfig
else:
    config = DevelopmentConfig
