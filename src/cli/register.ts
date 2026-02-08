import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface RegisterOptions {
  channelId: string;
  secret: string;
  apiUrl?: string;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('用法: npm run register <channelId> <secret> [--api-url <URL>]');
    console.error('示例: npm run register abc-123 xyz-789 --api-url http://localhost:3000');
    process.exit(1);
  }

  const channelId = args[0];
  const secret = args[1];
  
  // 解析参数
  const apiUrlArgIndex = args.indexOf('--api-url');
  const apiUrl = apiUrlArgIndex > -1 && apiUrlArgIndex + 1 < args.length 
    ? args[apiUrlArgIndex + 1] 
    : process.env.WEBHUB_API_URL || 'http://localhost:3000';

  try {
    console.log(`正在注册 Channel: ${channelId}`);
    console.log(`API URL: ${apiUrl}`);
    
    const response = await axios.post(`${apiUrl}/api/channel/register`, {
      channelId,
      secret
    });

    if (response.data.success) {
      console.log('✅ 注册成功!');
      console.log(`Channel ID: ${response.data.data.channelId}`);
      console.log(`Access Token: ${response.data.data.accessToken}`);
      console.log('');
      console.log('💡 将以下环境变量保存到 .env 文件:');
      console.log(`WEBHUB_CHANNEL_ID=${channelId}`);
      console.log(`WEBHUB_ACCESS_TOKEN=${response.data.data.accessToken}`);
      console.log(`WEBHUB_API_URL=${apiUrl}`);
      
      process.exit(0);
    } else {
      console.error('❌ 注册失败:', response.data.error);
      process.exit(1);
    }
  } catch (error: unknown) {
    const err = error as Error & { response?: { data?: { error?: string } } };
    console.error('❌ 注册失败:', err.response?.data?.error || err.message);
    process.exit(1);
  }
}

main();
