require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField, Partials } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const mongoose = require('mongoose');
const ChannelSetting = require('./ChannelSetting');

const token = process.env.TOKEN;
const mongoUri = process.env.MONGODB;
const port = 10000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const app = express();
app.use(express.json());

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands(clientId) {
  const roleKeys = [
    'daffodil', 'watermelon', 'pumpkin', 'apple', 'bamboo', 'coconut',
    'cactus', 'dragonfruit', 'mango', 'grape', 'mushroom', 'pepper',
    'godlysprinkler', 'advancedsprinkler', 'mastersprinkler', 'lightningrod',
    'rain', 'thunderstorm', 'frost'
  ];

  const setRolesCommand = new SlashCommandBuilder()
    .setName('setroles')
    .setDescription('Set roles to be pinged for stock updates by item.');

  roleKeys.forEach(key => {
    setRolesCommand.addStringOption(option =>
      option.setName(key).setDescription(`Role to ping for ${key.charAt(0).toUpperCase() + key.slice(1)}.`).setRequired(false)
    );
  });

  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive stock notifications.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setpetchannel')
      .setDescription('Select a channel to receive egg/pet notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive pet egg drops.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setweatherchannel')
      .setDescription('Select a channel to receive weather notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive weather alerts.').setRequired(true)
      ),
    setRolesCommand,
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member, guildId } = interaction;
  if (!guildId) return;

  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
  }

  const selectedChannel = interaction.options.getChannel('channel');

  try {
    await interaction.deferReply({ ephemeral: true });

    switch (commandName) {
      case 'setchannel':
        await ChannelSetting.findOneAndUpdate(
          { guildId },
          { guildId, channelId: selectedChannel.id },
          { upsert: true }
        );
        await interaction.editReply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
        break;

      case 'setweatherchannel':
        await ChannelSetting.findOneAndUpdate(
          { guildId },
          { guildId, weatherChannelId: selectedChannel.id },
          { upsert: true }
        );
        await interaction.editReply(`🌤️ Weather notifications will now be sent to ${selectedChannel}.`);
        break;

      case 'setpetchannel':
        await ChannelSetting.findOneAndUpdate(
          { guildId },
          { guildId, petChannelId: selectedChannel.id },
          { upsert: true }
        );
        await interaction.editReply(`🥚 Pet/Egg notifications will now be sent to ${selectedChannel}.`);
        break;

      case 'setroles': {
        const roleKeys = [
          'daffodil', 'watermelon', 'pumpkin', 'apple', 'bamboo', 'coconut',
          'cactus', 'dragonfruit', 'mango', 'grape', 'mushroom', 'pepper',
          'godlysprinkler', 'advancedsprinkler', 'mastersprinkler', 'lightningrod',
          'rain', 'thunderstorm', 'frost'
        ];

        const roles = {};
        roleKeys.forEach(key => {
          const role = interaction.options.getString(key);
          if (role) roles[key] = role;
        });

        await ChannelSetting.findOneAndUpdate(
          { guildId },
          { $set: { roles } },
          { upsert: true }
        );

        await interaction.editReply({ content: `✅ Roles saved: ${JSON.stringify(roles)}`, ephemeral: true });
        break;
      }

      case 'help':
        await interaction.editReply({
          content: `📘 Commands:\n- /setchannel — Set stock notification channel (admin only)\n- /setweatherchannel — Set weather notification channel (admin only)\n- /setpetchannel — Set egg/pet drop channel (admin only)\n- /setroles — Set roles to ping by item (admin only)\n- /help — Show this help message`,
          ephemeral: true
        });
        break;
    }
  } catch (err) {
    console.error(`❌ Command handling error for ${commandName}:`, err);
    await interaction.editReply('❌ An error occurred while processing the command.');
  }
});

const removeStockSuffix = (text) => text.replace(/:.*$/, '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

function extractLinesFromEmbed(embed) {
  const lines = [];
  if (embed.description) lines.push(...embed.description.split('\n'));
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      if (field.name) lines.push(...field.name.split('\n'));
      if (field.value) lines.push(...field.value.split('\n'));
    }
  }
  return lines.map(line =>
    line.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '')
  );
}

app.post('/send-stock', async (req, res) => {
  const data = req.body;
  const type = data.type || 'stock';

  if (!data.embeds || !Array.isArray(data.embeds) || data.embeds.length === 0) {
    return res.status(400).send('No valid embed found in the webhook data.');
  }

  const embed = data.embeds[0];
  const normalizedLines = extractLinesFromEmbed(embed);
  const settings = await ChannelSetting.find();

  for (const setting of settings) {
    let channelIdToUse = setting.channelId;
    if (type === 'weather' && setting.weatherChannelId) {
      channelIdToUse = setting.weatherChannelId;
    } else if (type === 'pet' && setting.petChannelId) {
      channelIdToUse = setting.petChannelId;
    }

    const channel = await client.channels.fetch(channelIdToUse).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;

    try {
      const pingRoles = [];
      if (setting.roles && typeof setting.roles === 'object') {
        for (const [key, roleId] of Object.entries(setting.roles)) {
          const formattedKey = removeStockSuffix(key);
          if (normalizedLines.some(line => line.includes(formattedKey))) {
            pingRoles.push(`${roleId}`);
            console.log(`✅ Matched keyword "${key}" → ping <@&${roleId}>`);
          }
        }
      }

      await channel.send({
        content: pingRoles.length > 0 ? pingRoles.join(' ') : null,
        embeds: [embed],
      });

    } catch (err) {
      console.error(`❌ Failed to send to channel ${channelIdToUse}:`, err);
    }
  }

  res.sendStatus(200);
});

function updateBotStatus() {
  let i = 0;
  const getTotalUsers = () => client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
  const activities = [
    () => ({ type: 3, name: `/help` }),
    () => ({ type: 3, name: `${client.guilds.cache.size} servers` }),
    () => ({ type: 3, name: `${getTotalUsers()} users` }),
  ];

  setInterval(() => {
    const activity = activities[i % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
    i++;
  }, 10000);
}

client.guilds.cache.forEach(guild => guild.members.fetch().catch(() => {}));

mongoose.connect(mongoUri)
  .then(() => {
    console.log('🟢 Connected to MongoDB.');
    app.listen(port, () => console.log(`🚀 Express server running on http://localhost:${port}`));
    client.login(token);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
  });

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands(client.user.id);
  updateBotStatus();
});
