// Plugin entry point - loaded by OpenClaw via jiti
// Type imports will be resolved at runtime by OpenClaw's SDK

export default function registerWebHubPlugin(api: any) {
  const pluginId = 'webhub-channel'

  // Register channel plugin
  api.registerChannel({
    id: pluginId,
    meta: {
      id: pluginId,
      label: 'WebHub',
      selectionLabel: 'WebHub (Self-hosted)',
      docsPath: 'https://github.com/chatu-ai/chatu-web-hub-service',
      blurb: 'Self-hosted WebHub messaging channel',
      aliases: ['webhub', 'wh'],
    },
    capabilities: {
      chatTypes: ['direct', 'group'],
      media: ['text', 'image', 'audio', 'video', 'file'],
      features: ['mentions', 'threads', 'reactions'],
    },
    config: {
      listAccountIds: (cfg: any) => Object.keys(cfg.channels?.webhub?.accounts ?? {}),
      resolveAccount: (cfg: any, accountId: string) =>
        cfg.channels?.webhub?.accounts?.[accountId ?? 'default'] ?? { accountId },
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
        .command('webhub:register')
        .description('Register a WebHub channel')
        .option('--channel-id <id>', 'Channel ID')
        .option('--secret <secret>', 'Channel secret')
        .option('--api-url <url>', 'WebHub API URL')
        .action(async (options: any) => {
          console.log('Use npm run register command instead')
          console.log('Example: npm run register <channelId> <secret> --api-url <url>')
        })
    },
    { commands: ['webhub:register'] }
  )

  api.logger?.info({ event: 'plugin_loaded', pluginId }, 'WebHub plugin loaded')
}

