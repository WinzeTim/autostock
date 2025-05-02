require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const express = require('express');
const app = express();
const port = 10000;

const token = process.env.TOKEN;

const channelSelections = {}; // Maps user IDs to channel IDs
const roleSelections = {};    // Maps user IDs to arrays of role IDs

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const rest = new REST({ version: '10' }).setToken(token);

// Define seed and gear options
const seedOptions = [
  'Daffodil Seeds',
  'Watermelon Seeds',
  'Pumpkin Seeds',
  'Apple Seeds',
  'Bamboo Seeds',
  'Coconut Seeds',
  'Cactus Seeds',
  'Dragon Fruit Seeds',
  'Mango Seeds',
  'Grape Seeds',
  'Mushroom Seeds',
];

const gearOptions = [
  'Godly Sprinkler',
  'Advanced Sprinkler',
  'Master Sprinkler',
  'Lightning Rod',
];

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to receive stock notifications.')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator), // Admin-only

    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Select roles to be pinged for stock updates.')
      .addStringOption(option =>
        option.setName('roles')
          .setDescription('Select roles to be pinged.')
          .setRequired(true)
          .addChoices(
            ...seedOptions.map(seed => ({ name: seed, value: seed })),
            ...gearOptions.map(gear => ({ name: gear, value: gear }))
          )
      ),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Display available commands and their descriptions.'),
  ].map(command => command.toJSON());

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

client.once('ready', () => {
  console.log('🤖 Discord bot is ready!');
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'setchannel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    channelSelections[interaction.user.id] = selectedChannel.id;
    await interaction.reply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
  }

  else if (commandName === 'setroles') {
    const selectedRole = interaction.options.getString('roles');
    const guild = interaction.guild;

    // Find the role by name
    const role = guild.roles.cache.find(r => r.name === selectedRole);
    if (!role) {
      return interaction.reply({ content: `❌ Role "${selectedRole}" not found in this server.`, ephemeral: true });
    }

    // Store the role ID for the user
    if (!roleSelections[interaction.user.id]) {
      roleSelections[interaction.user.id] = [];
    }
    if (!roleSelections[interaction.user.id].includes(role.id)) {
      roleSelections[interaction.user.id].push(role.id);
    }

    await interaction.reply(`✅ You will be pinged for updates related to "${selectedRole}".`);
  }

  else if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📖 Bot Commands')
      .setDescription('Here are the available commands:')
      .addFields(
        { name: '/setchannel', value: 'Select a channel to receive stock notifications. (Admin only)' },
        { name: '/setroles', value: 'Select roles to be pinged for stock updates.' },
        { name: '/help', value: 'Display this help message.' }
      )
      .setColor(0x00AE86);

    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// Express server setup
app.use(express.json());

app.post('/send-stock', async (req, res) => {
  const stockData = req.body;
  if (!stockData) return res.status(400).send('No stock data received');

  console.log('📦 Received stock data:', stockData);

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Shop Stock Update')
    .setDescription('Here are the current shop items available:')
    .setColor(0x58D68D);

  const items = stockData.content.split('\n');

  items.forEach(item => {
    const [name, quantity] = item.split(' : ');
    if (name && quantity) {
      const isGear = quantity.toLowerCase().includes('gear');
      const emoji = isGear ? '🛠️' : '🌱';
      embed.addFields({
        name: `${emoji} ${name}`,
        value: `Stock: ${quantity}`,
        inline: true,
      });
    }
  });

  // Send the embed to each user's selected channel and mention their selected roles
  for (const userId in channelSelections) {
    const channelId = channelSelections[userId];
    const channel = client.channels.cache.get(channelId);
    const guild = channel.guild;

    if (channel) {
      try {
        const roleIds = roleSelections[userId] || [];
        const roleMentions = roleIds.map(id => `<@&${id}>`).join(' ');
        const content = roleMentions || null;

        await channel.send({ content, embeds: [embed] });
        console.log(`✅ Message sent to channel ${channel.name}`);
      } catch (error) {
        console.error(`❌ Failed to send message to channel ${channelId}:`, error);
      }
    }
  }

  res.status(200).send('Stock sent to selected channels.');
});

app.listen(port, () => {
  console.log(`🌐 Express server running on http://localhost:${port}`);
});

client.login(token);
