// Plugin entry point - loaded by OpenClaw via jiti
// Type imports will be resolved at runtime by OpenClaw's SDK

export default function registerWebHubPlugin(api: any) {
  const pluginId = 'chatu-webhub'

  // Register channel plugin
  api.registerChannel({
    id: pluginId,
    meta: {
      id: pluginId,
      label: 'Chatu-WebHub',
      selectionLabel: 'Chatu-WebHub (Self-hosted)',
      docsPath: 'https://github.com/chatu-ai/chatu-web-hub-service',
      blurb: 'Self-hosted WebHub messaging channel for websites',
      aliases: ['webhub', 'chatu'],
    },
    capabilities: {
      chatTypes: ['direct', 'group'],
      media: ['text', 'image', 'audio', 'video', 'file'],
      features: ['mentions', 'threads', 'reactions'],
    },
    config: {
      listAccountIds: (cfg: any) => Object.keys(cfg.channels?.chatuwebhub?.accounts ?? {}),
      resolveAccount: (cfg: any, accountId: string) =>
        cfg.channels?.chatuwebhub?.accounts?.[accountId ?? 'default'] ?? { accountId },
    },
    outbound: {
      deliveryMode: 'direct',
      sendText: async ({ text, target }: any) => {
        return { ok: true, messageId: `wh_${Date.now()}` }
      },
    },
  })

  // Register CLI command for registration
  api.registerCli(
    ({ program }: any) => {
      program
        .command('chatu-webhub:register')
        .description('Register a Chatu-WebHub channel')
        .option('--channel-id <id>', 'Channel ID')
        .option('--secret <secret>', 'Channel secret')
        .option('--api-url <url>', 'WebHub API URL')
        .action(async (options: any) => {
          console.log('Use openclaw channels add command instead')
          console.log('Example: openclaw channels add --channel chatu-webhub --token <channelId>:<secret> --api-url <url>')
        })
    },
    { commands: ['chatu-webhub:register'] }
  )

  api.logger?.info({ event: 'plugin_loaded', pluginId }, 'Chatu-WebHub plugin loaded')
}

