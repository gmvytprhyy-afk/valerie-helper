// events.js - Complete Event System with Logging
const { Events, EmbedBuilder } = require('discord.js');
const {
  processMemberJoin,
  processMemberLeave,
  processMessageEvent,
  processInviteJoinReward,
  processInviteLeavePenalty,
  processMessageReward
} = require('./economy.js');
const {
  getWelcomeSettings,
  updateWelcomeSettings,
  getLeaveSettings,
  updateLeaveSettings,
  getLoggingSettings,
  updateLoggingSettings,
  logAction,
  getAutoModSettings,
  processAutoMod
} = require('./database.js');
const {
  createWelcomeEmbed,
  createWelcomeDMEmbed,
  createLeaveEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed
} = require('./embeds.js');

// ================ CLIENT REFERENCE ================
let clientInstance = null;

// ================ READY EVENT ================
const handleReady = async (client) => {
  clientInstance = client;
  console.log(`✅ ${client.user.tag} is online!`);
  console.log(`📡 Serving ${client.guilds.cache.size} guilds`);
  console.log(`👥 Serving ${client.users.cache.size} users`);
  
  // Set bot status
  client.user.setPresence({
    activities: [
      {
        name: `${client.guilds.cache.size} servers | /help`,
        type: 3 // LISTENING
      }
    ],
    status: 'online'
  });
};

// ================ MEMBER JOIN EVENT ================
const handleMemberJoin = async (member) => {
  const guildId = member.guild.id;
  const userId = member.user.id;
  
  console.log(`👋 ${member.user.tag} joined ${member.guild.name}`);
  
  try {
    // Process invite rewards (crystal system)
    const inviteResult = await processInviteJoinReward(null, userId, guildId);
    console.log(`📊 Invite result:`, inviteResult.message);
    
    // Process member join (existing)
    const result = await processMemberJoin(userId, guildId);
    console.log(`📊 Join result:`, result.message);
    
    // Log join
    await logJoin(member);
    
    // Process welcome message
    const settings = await getWelcomeSettings(guildId);
    if (settings.enabled && settings.channel_id) {
      const channel = await member.guild.channels.fetch(settings.channel_id);
      if (channel) {
        const embed = createWelcomeEmbed(member, settings);
        await channel.send({ embeds: [embed] });
      }
    }
    
    // DM welcome message
    if (settings.dm_enabled && settings.dm_message) {
      try {
        const dmEmbed = createWelcomeDMEmbed(member, settings);
        await member.send({ embeds: [dmEmbed] });
      } catch (error) {
        console.error('Failed to send DM welcome:', error);
      }
    }
    
    // Auto role
    if (settings.role_on_join) {
      try {
        await member.roles.add(settings.role_on_join);
      } catch (error) {
        console.error('Failed to assign auto role:', error);
      }
    }
  } catch (error) {
    console.error(`❌ Error handling member join for ${userId}:`, error);
  }
};

// ================ MEMBER LEAVE EVENT ================
const handleMemberLeave = async (member) => {
  const guildId = member.guild.id;
  const userId = member.user.id;
  
  console.log(`👋 ${member.user.tag} left ${member.guild.name}`);
  
  try {
    // Process invite penalty
    const penaltyResult = await processInviteLeavePenalty(userId, guildId);
    console.log(`📊 Penalty result:`, penaltyResult.message);
    
    // Process member leave (existing)
    const result = await processMemberLeave(userId, guildId);
    console.log(`📊 Leave result:`, result.message);
    
    // Log leave
    await logLeave(member);
    
    // Process leave message
    const settings = await getLeaveSettings(guildId);
    if (settings.enabled && settings.channel_id) {
      const channel = await member.guild.channels.fetch(settings.channel_id);
      if (channel) {
        const embed = createLeaveEmbed(member, settings);
        await channel.send({ embeds: [embed] });
      }
    }
  } catch (error) {
    console.error(`❌ Error handling member leave for ${userId}:`, error);
  }
};

// ================ MESSAGE CREATE EVENT ================
// events.js - Fixed message handler
const handleMessageCreate = async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const guildId = message.guild.id;
  const userId = message.author.id;
  
  try {
    // Process message for crystal rewards
    const rewardResult = await processMessageReward(userId, guildId);
    
    // Log if crystals were earned
    if (rewardResult.crystalsEarned > 0) {
      console.log(`💎 ${message.author.tag} earned ${rewardResult.crystalsEarned} crystal(s) for reaching a milestone!`);
    }
  } catch (error) {
    console.error(`❌ Error processing message from ${userId}:`, error);
  }
};

// ================ MESSAGE DELETE EVENT ================
const handleMessageDelete = async (message) => {
  if (!message.guild) return;
  if (message.author?.bot) return;
  if (!message.content) return;
  
  await logMessageDelete(message);
};

// ================ MESSAGE UPDATE EVENT ================
const handleMessageUpdate = async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  if (!oldMessage.content || !newMessage.content) return;
  
  await logMessageEdit(oldMessage, newMessage);
};

// ================ ROLE UPDATE EVENT ================
const handleRoleUpdate = async (oldMember, newMember) => {
  if (oldMember.user.bot) return;
  if (oldMember.roles.cache.size === newMember.roles.cache.size) return;
  
  await logRoleUpdate(oldMember, newMember);
};

// ================ NICKNAME UPDATE EVENT ================
const handleNicknameUpdate = async (oldMember, newMember) => {
  if (oldMember.user.bot) return;
  if (oldMember.nickname === newMember.nickname) return;
  
  await logNicknameUpdate(oldMember, newMember);
};

// ================ CHANNEL CREATE EVENT ================
const handleChannelCreate = async (channel) => {
  if (!channel.guild) return;
  await logChannelAction(channel, 'create');
};

// ================ CHANNEL DELETE EVENT ================
const handleChannelDelete = async (channel) => {
  if (!channel.guild) return;
  await logChannelAction(channel, 'delete');
};

// ================ VOICE STATE UPDATE EVENT ================
const handleVoiceStateUpdate = async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  
  if (!oldChannel && newChannel) {
    await logVoiceState(member, newState, 'join');
  } else if (oldChannel && !newChannel) {
    await logVoiceState(member, oldState, 'leave');
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    await logVoiceState(member, newState, 'switch');
  }
};

// ================ LOGGING EVENT HANDLERS ================

// Log join
const logJoin = async (member) => {
  const settings = await getLoggingSettings(member.guild.id);
  if (!settings.log_channel || !settings.log_joins) return;
  
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('👤 Member Joined')
    .setDescription(`${member.user.tag} joined the server`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'User ID', value: member.user.id, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });
  
  await sendLog(member.guild.id, settings.log_channel, embed);
  await logAction(member.guild.id, 'join', { userId: member.user.id });
};

// Log leave
const logLeave = async (member) => {
  const settings = await getLoggingSettings(member.guild.id);
  if (!settings.log_channel || !settings.log_leaves) return;
  
  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('👤 Member Left')
    .setDescription(`${member.user.tag} left the server`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'User ID', value: member.user.id, inline: true },
      { name: 'Joined At', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });
  
  await sendLog(member.guild.id, settings.log_channel, embed);
  await logAction(member.guild.id, 'leave', { userId: member.user.id });
};

// Log deleted message
const logMessageDelete = async (message) => {
  const settings = await getLoggingSettings(message.guild.id);
  if (!settings.log_channel || !settings.log_deletes) return;
  
  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('🗑️ Message Deleted')
    .setDescription(`Message by ${message.author?.tag || 'Unknown User'} was deleted`)
    .addFields(
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'User', value: message.author?.tag || 'Unknown', inline: true },
      { name: 'Content', value: message.content || 'No content', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() });
  
  await sendLog(message.guild.id, settings.log_channel, embed);
  await logAction(message.guild.id, 'delete', { 
    userId: message.author?.id, 
    channelId: message.channel.id,
    content: message.content 
  });
};

// Log edited message
const logMessageEdit = async (oldMessage, newMessage) => {
  const settings = await getLoggingSettings(oldMessage.guild.id);
  if (!settings.log_channel || !settings.log_edits) return;
  
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('✏️ Message Edited')
    .setDescription(`Message by ${oldMessage.author?.tag} was edited`)
    .addFields(
      { name: 'Channel', value: `<#${oldMessage.channel.id}>`, inline: true },
      { name: 'User', value: oldMessage.author?.tag || 'Unknown', inline: true },
      { name: 'Before', value: oldMessage.content || 'No content', inline: false },
      { name: 'After', value: newMessage.content || 'No content', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: oldMessage.guild.name, iconURL: oldMessage.guild.iconURL() });
  
  await sendLog(oldMessage.guild.id, settings.log_channel, embed);
  await logAction(oldMessage.guild.id, 'edit', { 
    userId: oldMessage.author?.id, 
    channelId: oldMessage.channel.id,
    content: newMessage.content 
  });
};

// Log role update
const logRoleUpdate = async (oldMember, newMember) => {
  const settings = await getLoggingSettings(oldMember.guild.id);
  if (!settings.log_channel || !settings.log_roles) return;
  
  const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  
  if (added.size === 0 && removed.size === 0) return;
  
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎭 Roles Updated')
    .setDescription(`Roles updated for ${oldMember.user.tag}`)
    .setThumbnail(oldMember.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'User', value: `${oldMember.user.tag} (${oldMember.user.id})`, inline: true },
      { name: 'Added Roles', value: added.map(r => `<@&${r.id}>`).join(' ') || 'None', inline: false },
      { name: 'Removed Roles', value: removed.map(r => `<@&${r.id}>`).join(' ') || 'None', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: oldMember.guild.name, iconURL: oldMember.guild.iconURL() });
  
  await sendLog(oldMember.guild.id, settings.log_channel, embed);
  await logAction(oldMember.guild.id, 'role_update', { 
    userId: oldMember.user.id,
    details: { added: added.map(r => r.id), removed: removed.map(r => r.id) }
  });
};

// Log nickname update
const logNicknameUpdate = async (oldMember, newMember) => {
  const settings = await getLoggingSettings(oldMember.guild.id);
  if (!settings.log_channel || !settings.log_nicknames) return;
  
  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle('✏️ Nickname Updated')
    .setDescription(`Nickname changed for ${oldMember.user.tag}`)
    .setThumbnail(oldMember.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'User', value: `${oldMember.user.tag} (${oldMember.user.id})`, inline: true },
      { name: 'Before', value: oldMember.nickname || 'None', inline: true },
      { name: 'After', value: newMember.nickname || 'None', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: oldMember.guild.name, iconURL: oldMember.guild.iconURL() });
  
  await sendLog(oldMember.guild.id, settings.log_channel, embed);
  await logAction(oldMember.guild.id, 'nickname_update', { 
    userId: oldMember.user.id,
    details: { old: oldMember.nickname, new: newMember.nickname }
  });
};

// Log channel create/delete
const logChannelAction = async (channel, action) => {
  const settings = await getLoggingSettings(channel.guild.id);
  if (!settings.log_channel || !settings.log_channels) return;
  
  const embed = new EmbedBuilder()
    .setColor(action === 'create' ? '#2ECC71' : '#E74C3C')
    .setTitle(`${action === 'create' ? '📢 Channel Created' : '🗑️ Channel Deleted'}`)
    .setDescription(`${action === 'create' ? 'Created' : 'Deleted'} channel #${channel.name}`)
    .addFields(
      { name: 'Channel ID', value: channel.id, inline: true },
      { name: 'Channel Type', value: channel.type, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL() });
  
  await sendLog(channel.guild.id, settings.log_channel, embed);
  await logAction(channel.guild.id, `channel_${action}`, { 
    channelId: channel.id,
    details: { name: channel.name, type: channel.type }
  });
};

// Log voice state
const logVoiceState = async (member, voiceState, action) => {
  const settings = await getLoggingSettings(member.guild.id);
  if (!settings.log_channel || !settings.log_voice) return;
  
  const actionLabels = {
    join: 'joined',
    leave: 'left',
    switch: 'switched channels'
  };
  
  const embed = new EmbedBuilder()
    .setColor(action === 'join' ? '#2ECC71' : action === 'leave' ? '#E74C3C' : '#F39C12')
    .setTitle(`${action === 'join' ? '🔊 Voice Joined' : action === 'leave' ? '🔇 Voice Left' : '🔄 Voice Switched'}`)
    .setDescription(`${member.user.tag} ${actionLabels[action] || action} voice channel`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Channel', value: voiceState.channel?.name || 'Unknown', inline: true }
    )
    .setTimestamp()
    .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });
  
  await sendLog(member.guild.id, settings.log_channel, embed);
  await logAction(member.guild.id, `voice_${action}`, { 
    userId: member.user.id,
    channelId: voiceState.channel?.id,
    details: { channel: voiceState.channel?.name }
  });
};

// Helper: Send log embed
const sendLog = async (guildId, channelId, embed) => {
  try {
    if (!clientInstance) return;
    const channel = await clientInstance.channels.fetch(channelId);
    if (channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Failed to send log:', error);
  }
};

// ================ WELCOME/LEAVE SETTINGS COMMAND HANDLERS ================

// Set welcome channel
const handleSetWelcome = async (interaction) => {
  if (!interaction.memberPermissions.has('Administrator')) {
    const embed = errorEmbed('You need **Administrator** permissions to use this command.');
    await interaction.reply({ embeds: [embed], ephemeral: false });
    return;
  }
  
  const channel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const color = interaction.options.getString('color');
  const dmEnabled = interaction.options.getBoolean('dm_enabled');
  const dmMessage = interaction.options.getString('dm_message');
  const role = interaction.options.getRole('role');
  const showCount = interaction.options.getBoolean('show_count');
  const showAvatar = interaction.options.getBoolean('show_avatar');
  
  try {
    const current = await getWelcomeSettings(interaction.guildId);
    
    const settings = {
      enabled: true,
      channel_id: channel?.id || current.channel_id,
      message: message || current.message,
      embed_title: title || current.embed_title,
      embed_description: description || current.embed_description,
      embed_color: color || current.embed_color || '#2ECC71',
      dm_enabled: dmEnabled !== null ? dmEnabled : current.dm_enabled,
      dm_message: dmMessage || current.dm_message,
      role_on_join: role?.id || current.role_on_join,
      show_member_count: showCount !== null ? showCount : current.show_member_count,
      show_avatar: showAvatar !== null ? showAvatar : current.show_avatar
    };
    
    await updateWelcomeSettings(interaction.guildId, settings);
    
    const embed = successEmbed('✅ Welcome System Configured', {
      fields: [
        { name: '📢 Channel', value: channel ? `<#${channel.id}>` : 'Not set', inline: true },
        { name: '📊 Status', value: '✅ Enabled', inline: true },
        { name: '📝 Message', value: message || current.message || 'Default welcome message', inline: false },
        { name: '💬 DM Enabled', value: settings.dm_enabled ? '✅ Yes' : '❌ No', inline: true },
        { name: '🎭 Auto Role', value: role ? `<@&${role.id}>` : 'None', inline: true }
      ],
      author: {
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL()
      }
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: false });
  } catch (error) {
    console.error('Error in /setwelcome:', error);
    const embed = errorEmbed(error.message || 'Failed to configure welcome system.');
    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};

// Set leave channel
const handleSetLeave = async (interaction) => {
  if (!interaction.memberPermissions.has('Administrator')) {
    const embed = errorEmbed('You need **Administrator** permissions to use this command.');
    await interaction.reply({ embeds: [embed], ephemeral: false });
    return;
  }
  
  const channel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const color = interaction.options.getString('color');
  const showCount = interaction.options.getBoolean('show_count');
  const showAvatar = interaction.options.getBoolean('show_avatar');
  
  try {
    const current = await getLeaveSettings(interaction.guildId);
    
    const settings = {
      enabled: true,
      channel_id: channel?.id || current.channel_id,
      message: message || current.message,
      embed_title: title || current.embed_title,
      embed_description: description || current.embed_description,
      embed_color: color || current.embed_color || '#E74C3C',
      show_member_count: showCount !== null ? showCount : current.show_member_count,
      show_avatar: showAvatar !== null ? showAvatar : current.show_avatar
    };
    
    await updateLeaveSettings(interaction.guildId, settings);
    
    const embed = successEmbed('✅ Leave System Configured', {
      fields: [
        { name: '📢 Channel', value: channel ? `<#${channel.id}>` : 'Not set', inline: true },
        { name: '📊 Status', value: '✅ Enabled', inline: true },
        { name: '📝 Message', value: message || current.message || 'Default leave message', inline: false }
      ],
      author: {
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL()
      }
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: false });
  } catch (error) {
    console.error('Error in /setleave:', error);
    const embed = errorEmbed(error.message || 'Failed to configure leave system.');
    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};

// ================ REGISTER EVENTS ================

const registerEvents = (client) => {
  clientInstance = client;
  
  // Ready event
  client.once(Events.ClientReady, async () => {
    await handleReady(client);
  });
  
  // Member events
  client.on(Events.GuildMemberAdd, async (member) => {
    await handleMemberJoin(member);
  });
  
  client.on(Events.GuildMemberRemove, async (member) => {
    await handleMemberLeave(member);
  });
  
  // Message events
  client.on(Events.MessageCreate, async (message) => {
    await handleMessageCreate(message);
  });
  
  client.on(Events.MessageDelete, async (message) => {
    await handleMessageDelete(message);
  });
  
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await handleMessageUpdate(oldMessage, newMessage);
  });
  
  // Role and nickname events
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    await handleRoleUpdate(oldMember, newMember);
    await handleNicknameUpdate(oldMember, newMember);
  });
  
  // Channel events
  client.on(Events.ChannelCreate, async (channel) => {
    await handleChannelCreate(channel);
  });
  
  client.on(Events.ChannelDelete, async (channel) => {
    await handleChannelDelete(channel);
  });
  
  // Voice events
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await handleVoiceStateUpdate(oldState, newState);
  });
  
  // Error handling
  client.on(Events.Error, (error) => {
    console.error('❌ Discord client error:', error);
  });
  
  client.on(Events.Warn, (warning) => {
    console.warn('⚠️ Discord client warning:', warning);
  });
  
  console.log('🎯 All event handlers registered');
};

// ================ EXPORTS ================
module.exports = {
  // Event Handlers
  handleReady,
  handleMemberJoin,
  handleMemberLeave,
  handleMessageCreate,
  handleMessageDelete,
  handleMessageUpdate,
  handleRoleUpdate,
  handleNicknameUpdate,
  handleChannelCreate,
  handleChannelDelete,
  handleVoiceStateUpdate,
  
  // Logging Functions
  logJoin,
  logLeave,
  logMessageDelete,
  logMessageEdit,
  logRoleUpdate,
  logNicknameUpdate,
  logChannelAction,
  logVoiceState,
  sendLog,
  
  // Command Handlers
  handleSetWelcome,
  handleSetLeave,
  
  // Registration
  registerEvents
};