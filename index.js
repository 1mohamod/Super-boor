const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, SlashCommandBuilder, Events, REST, Routes, PermissionsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const config = require("./config.json");
const TOKEN = process.env.TOKEN;
const BOT_ID = process.env.BOT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

let applyChannel = null;
let blockedUsers = new Set();
let submittedUsers = new Set();

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("إرسال زر التقديم (للمسؤولين فقط)"),
    new SlashCommandBuilder()
      .setName("setappy")
      .setDescription("تحديد روم استقبال التقديمات")
      .addChannelOption(option => option.setName("channel").setDescription("حدد الروم").setRequired(true)),
    new SlashCommandBuilder()
      .setName("block")
      .setDescription("حظر عضو من التقديم")
      .addUserOption(opt => opt.setName("user").setDescription("العضو").setRequired(true)),
    new SlashCommandBuilder()
      .setName("unblock")
      .setDescription("إلغاء حظر عضو من التقديم")
      .addUserOption(opt => opt.setName("user").setDescription("العضو").setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(BOT_ID), { body: commands });
  console.log("✅ Slash commands registered.");
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member } = interaction;

    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "❌ هذا الأمر مخصص للإدارة فقط.", ephemeral: true });
    
    if (commandName === "setup") {
      const btn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("apply_now")
          .setLabel("📝 تقديم للإدارة")
          .setStyle(ButtonStyle.Primary)
      );
      await interaction.reply({ content: "✅ زر التقديم:", components: [btn], ephemeral: true });

    } else if (commandName === "setappy") {
      applyChannel = interaction.options.getChannel("channel");
      interaction.reply({ content: `✅ تم تعيين <#${applyChannel.id}> كروم لاستقبال التقديمات.`, ephemeral: true });

    } else if (commandName === "block") {
      const user = interaction.options.getUser("user");
      blockedUsers.add(user.id);
      interaction.reply({ content: `🚫 تم حظر ${user.tag} من التقديم.`, ephemeral: true });

    } else if (commandName === "unblock") {
      const user = interaction.options.getUser("user");
      blockedUsers.delete(user.id);
      interaction.reply({ content: `✅ تم فك الحظر عن ${user.tag}.`, ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "apply_now") {
      if (blockedUsers.has(interaction.user.id)) {
        return interaction.reply({ content: "🚫 أنت محظور من التقديم.", ephemeral: true });
      }
      if (submittedUsers.has(interaction.user.id)) {
        return interaction.reply({ content: "❗ لقد قدمت مسبقًا.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("admin_application")
        .setTitle("نموذج التقديم");

      config.applicationQuestions.forEach((q, i) => {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`q${i}`)
              .setLabel(q)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      });

      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "admin_application") {
    submittedUsers.add(interaction.user.id);

    const answers = config.applicationQuestions.map((_, i) => interaction.fields.getTextInputValue(`q${i}`));
    const embed = new EmbedBuilder()
      .setTitle("📥 تقديم جديد")
      .setThumbnail(interaction.user.displayAvatarURL())
      .setColor(config.embedColor)
      .addFields(
        { name: "👤 مقدم الطلب", value: `<@${interaction.user.id}>`, inline: true },
        ...answers.map((a, i) => ({ name: config.applicationQuestions[i], value: a }))
      );

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel("✅ قبول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel("❌ رفض").setStyle(ButtonStyle.Danger)
    );

    if (!applyChannel) return interaction.reply({ content: "❌ لم يتم تعيين روم التقديم بعد. استخدم /setappy", ephemeral: true });

    applyChannel.send({ embeds: [embed], components: [actionRow] });
    interaction.reply({ content: "✅ تم إرسال تقديمك للإدارة.", ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId.startsWith("accept_")) {
    const userId = interaction.customId.split("_")[1];
    const user = await client.users.fetch(userId);
    user.send("✅ تم قبولك في الإدارة!");
    interaction.reply({ content: "✅ تم قبول العضو.", ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId.startsWith("reject_")) {
    const userId = interaction.customId.split("_")[1];
    const user = await client.users.fetch(userId);
    user.send("❌ تم رفض طلبك.");
    interaction.reply({ content: "❌ تم رفض العضو.", ephemeral: true });
  }
});

client.login(TOKEN);
