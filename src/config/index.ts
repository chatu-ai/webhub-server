import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  cors: {
    origin: string;
  };
  logging: {
    level: string;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;
