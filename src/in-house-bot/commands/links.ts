import { ICommand } from '../types'
import { getAppLinks, getAppLinksInstructions } from '../utils'

export const command:ICommand = {
  name: 'links',
  description: 'generate invite links to your channel',
  examples: [
    '/links'
  ],
  exec: async ({ commander, req, args }) => {
    const { bot } = commander
    const permalink = await bot.getPermalink()
    return getAppLinks({ bot, permalink })
  },
  sendResult: async ({ commander, req, args, result }) => {
    return commander.productsAPI.sendSimpleMessage({
      req,
      to: req.user,
      message: getAppLinksInstructions(result)
    })
  }
}
