require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, Partials } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const app = express();
const port = 10000;

const token = process.env.TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const rest = new REST({ version: '10' }).setToken(token);

const channelSelections = {}; // User ID -> Channel ID
const roleSelections = {};    // Guild ID -> Array of role names

const seedOptions = [
  'Daffodil Seeds', 'Watermelon Seeds', 'Pumpkin Seeds', 'Apple Seeds', 'Bamboo Seeds',
  'Coconut Seeds', 'Cactus Seeds', 'Dragon Fruit Seeds', 'Mango Seeds', 'Grape Seeds', 'Mushroom Seeds'
];

const gearOptions = [
  'Godly Sprinkler', 'Advanced Sprinkler', 'Master Sprinkler', 'Lightning Rod'
];

async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to receive stock notifications.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Select roles to be pinged for stock updates.')
      .addStringOption(option =>
        option.setName('roles')
          .setDescription('Select roles to ping (comma-separated).')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.'),
  ].map(command => command.toJSON());

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log('✅ Slash commands registered.');
}

client.once('ready', () => {
  console.log('🤖 Bot is ready!');
  registerCommands(client.user.id);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, member, guildId, user } = interaction;

  if (commandName === 'setchannel') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be a server admin to use this command.', ephemeral: true });
    }
    const selectedChannel = interaction.options.getChannel('channel');
    channelSelections[user.id] = selectedChannel.id;
    await interaction.reply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
  }

  else if (commandName === 'setroles') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be a server admin to use this command.', ephemeral: true });
    }
    const rolesInput = interaction.options.getString('roles');
    const roles = rolesInput.split(',').map(r => r.trim());
    roleSelections[guildId] = roles;
    await interaction.reply(`✅ Roles saved: ${roles.join(', ')}`);
  }

  else if (commandName === 'help') {
    await interaction.reply({
      content: `📘 Available Commands:

/setchannel - Admin-only. Set the channel to receive stock updates.
/setroles - Admin-only. Select roles to ping for seeds/gears.
/help - Show this help message.`,
      ephemeral: true
    });
  }
});

// Express Web Server
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running. Use POST /send-stock to send data.');
});

app.use(express.json());

app.post('/send-stock', async (req, res) => {
  const stockData = req.body;

  if (!stockData || !stockData.content) return res.status(400).send('Invalid stock data.');

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Shop Stock Update')
    .setDescription('Here are the current shop items available:')
    .setColor(0x58D68D);

  const items = stockData.content.split('\n');
  const seeds = [], gears = [];

  // Process each item and sort into seeds or gears
  for (const item of items) {
    const [name, quantity] = item.split(' : ').map(s => s.trim());
    if (!name || !quantity) continue;
    
    const isGear = gearOptions.some(gear => name.includes(gear));
    if (isGear) {
      gears.push({ name, quantity });
    } else {
      seeds.push({ name, quantity });
    }
  }

  // Add seeds field to the embed
  if (seeds.length > 0) {
    embed.addFields({
      name: '🌱 Seeds',
      value: seeds.map(s => `${s.name}: ${s.quantity}`).join('\n'),
      inline: true
    });
  }

  // Add gears field to the embed
  if (gears.length > 0) {
    embed.addFields({
      name: '🛠️ Gears',
      value: gears.map(g => `${g.name}: ${g.quantity}`).join('\n'),
      inline: true
    });
  }

  // Send embed to all configured channels
  for (const userId in channelSelections) {
    const channelId = channelSelections[userId];
    const channel = client.channels.cache.get(channelId);
    if (!channel) continue;

    const guildId = channel.guildId;
    const rolesToPing = roleSelections[guildId] || [];
    const roleMentions = channel.guild.roles.cache
      .filter(role => rolesToPing.includes(role.name))
      .map(role => `<@&${role.id}>`).join(' ');

    try {
      await channel.send({ content: roleMentions || null, embeds: [embed] });
      console.log(`✅ Sent stock update to ${channel.name}`);
    } catch (error) {
      console.error(`❌ Failed to send to ${channel.name}:`, error);
    }
  }

  res.status(200).send('Stock sent to selected channels.');
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});

client.login(token);
