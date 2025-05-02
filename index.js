require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const token = process.env.TOKEN;
const mongo = process.env.MONGODB;

const channelSelections = {}; // User ID to channel ID map

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to receive stock notifications.')
          .setRequired(true)
      ),
  ].map(command => command.toJSON());

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // Make sure you have your CLIENT_ID environment variable set.
      { body: commands },
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

client.once('ready', () => {
  console.log('Bot is ready!');
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'setchannel') {
    const selectedChannel = interaction.options.getChannel('channel');
    channelSelections[interaction.user.id] = selectedChannel.id;
    await interaction.reply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
    console.log(`Channel ${selectedChannel.name} selected by ${interaction.user.tag}.`);
  }
});

// Root URL for browser access
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running. Use POST /send-stock to send data.');
});

// Handle POST request from Roblox
app.use(express.json());

app.post('/send-stock', async (req, res) => {
  const stockData = req.body;
  if (!stockData) return res.status(400).send('No stock data received');

  console.log('Received stock data:', stockData);

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Shop Stock Update')
    .setDescription('Here are the current shop items available:')
    .setColor(0x58D68D);

  // Add fields for seeds and gears if they exist
  if (stockData.seeds?.length > 0) {
    stockData.seeds.forEach(seed => {
      embed.addFields({ name: `🌱 ${seed.name}`, value: `Stock: ${seed.stock}`, inline: true });
    });
  }

  if (stockData.gears?.length > 0) {
    stockData.gears.forEach(gear => {
      embed.addFields({ name: `🛠️ ${gear.name}`, value: `Stock: ${gear.stock}`, inline: true });
    });
  }

  console.log('Sending embed:', embed); // Log the embed before sending

  // Loop through all channelSelections and send the message to each selected channel
  for (const userId in channelSelections) {
    const channelId = channelSelections[userId];
    const channel = client.channels.cache.get(channelId);

    console.log(`Trying to send message to channel: ${channel ? channel.name : 'Not found'}`);

    if (channel) {
      try {
        await channel.send({ embeds: [embed] });
        console.log(`Message sent to ${channel.name}`);
      } catch (error) {
        console.error(`Failed to send message to ${channelId}:`, error);
      }
    }
  }

  res.status(200).send('Stock sent to selected channels.');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

client.login(token);
