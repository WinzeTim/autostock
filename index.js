require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, Partials } = require('discord.js');
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
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive stock notifications.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setweatherchannel')
      .setDescription('Select a channel to receive weather notifications.')
      .addChannelOption(option =>
        option.setName('channel').setDescription('The channel to receive weather alerts.').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Set roles to be pinged for stock updates by item.')
      .addStringOption(option => option.setName('apple').setDescription('Role to ping for Apple Seeds.'))
      .addStringOption(option => option.setName('bamboo').setDescription('Role to ping for Bamboo Seeds.'))
      .addStringOption(option => option.setName('watermelon').setDescription('Role to ping for Watermelon Seeds.'))
      .addStringOption(option => option.setName('pumpkin').setDescription('Role to ping for Pumpkin Seeds.'))
      .addStringOption(option => option.setName('cactus').setDescription('Role to ping for Cactus Seeds.'))
      .addStringOption(option => option.setName('gear').setDescription('Role to ping for Gear items.')),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

async function loadSettings() {
  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    const guild = await client.guilds.fetch(setting.guildId).catch(() => null);
    if (!guild) continue;
    await client.channels.fetch(setting.channelId).catch(() => null);
    if (setting.weatherChannelId) await client.channels.fetch(setting.weatherChannelId).catch(() => null);
  }
}

client.on('ready', async () => {
  console.log('🤖 Bot is ready!');
  await registerCommands(client.user.id);
  await loadSettings();
  updateBotStatus();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member, guildId } = interaction;
  if (!guildId) return;

  if (commandName === 'setchannel') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');

    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, channelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating channel:', err);
      await interaction.editReply('❌ Failed to update the notification channel.');
    }

  } else if (commandName === 'setweatherchannel') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');

    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, weatherChannelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`🌤️ Weather notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating weather channel:', err);
      await interaction.editReply('❌ Failed to update the weather channel.');
    }

  } else if (commandName === 'setroles') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const roles = {};
    ['apple', 'bamboo', 'watermelon', 'pumpkin', 'cactus', 'gear'].forEach(item => {
      const role = interaction.options.getString(item);
      if (role) roles[item] = role;
    });

    await ChannelSetting.findOneAndUpdate(
      { guildId },
      { $set: { roles } },
      { upsert: true }
    );

    await interaction.reply({ content: `✅ Roles saved: ${JSON.stringify(roles)}`, ephemeral: true });

  } else if (commandName === 'help') {
    await interaction.reply({
      content: `📘 Commands:\n- /setchannel — Set stock notification channel (admin only)\n- /setweatherchannel — Set weather notification channel (admin only)\n- /setroles — Set roles to ping by item (admin only)\n- /help — Show this help message`,
      ephemeral: true
    });
  }
});

app.post('/send-stock', async (req, res) => {
  const data = req.body;
  const type = data.type || 'stock'; // 'weather' or 'stock'

  if (!data.embeds || !Array.isArray(data.embeds) || data.embeds.length === 0) {
    return res.status(400).send('No valid embed found in the webhook data.');
  }

  const embed = data.embeds[0];

  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    let channelIdToUse = setting.channelId;
    if (type === 'weather' && setting.weatherChannelId) {
      channelIdToUse = setting.weatherChannelId;
    }

    const channel = await client.channels.fetch(channelIdToUse).catch(() => null);
    if (channel && channel.isTextBased()) {
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`Failed to send to channel ${channelIdToUse}:`, err);
      }
    }
  }

  res.sendStatus(200);
});

function updateBotStatus() {
  const activities = [
    () => ({ type: 3, name: `/help` }),
    () => ({ type: 3, name: `${client.guilds.cache.size} servers...` })
  ];
  let i = 0;
  setInterval(() => {
    const activity = activities[i % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
    i++;
  }, 10000);
}

app.get('/', (req, res) => {
  res.send('✅ Stock bot is running.');
});

mongoose.connect(mongoUri)
  .then(() => {
    console.log('🟢 Connected to MongoDB.');
    app.listen(port, () => console.log(`🚀 Express server running on http://localhost:${port}`));
    client.login(token);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
  });
