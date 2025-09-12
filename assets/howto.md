# EverEtch User Guide 📚

## Welcome to EverEtch!

EverEtch is a smart, AI-powered word learning app that helps you memorize and discover new words. No ads, no subscriptions, just pure word learning powered by AI.

---

## 🚀 Getting Started

### 1. First Launch
When you open EverEtch for the first time:
- The app creates a default profile called "Default"
- You'll see an empty word list on the left
- The center panel shows a welcome message
- The right panel is for related words (initially empty)

### 2. Your First Word
1. Click in the input field at the bottom center
2. Type any word you want to learn (e.g., "serendipity")
3. Click the **Generate** button (lightning bolt icon) or press **Enter**
4. Watch as AI generates:
   - Word meaning and explanation
   - Suggested tags (categories)
   - Synonyms and antonyms
   - Related words

---

## 📝 Adding Words

### Basic Word Addition
1. **Type a word** in the input field
2. **Click Generate** or press Enter
3. **Review AI suggestions** for tags and related words
4. **Click "Add Word"** to save it to your collection

### Word States
- **Temp words** (blue): Newly generated, not yet saved
- **Saved words** (normal): Added to your collection
- **Existing words** (search icon): Already in your collection

### Smart Features
- **Auto-complete**: Start typing to see suggestions
- **Instant search**: Find words by typing any part
- **Tag discovery**: Click tags to find related words
- **Word relationships**: Explore synonyms and antonyms

---

## 📝 Adding Personal Remarks

### Remark Feature
EverEtch allows you to add personal notes and remarks to any saved word in your collection. This is perfect for:
- **Personal associations**: Link words to memories or experiences
- **Usage examples**: Note how you've seen the word used
- **Learning progress**: Track your understanding over time
- **Custom definitions**: Add your own simplified explanations
- **Study notes**: Include mnemonics or pronunciation tips

### How to Add Remarks
1. **Select a saved word** from your word list (left panel)
2. **View word details** in the center panel
3. **Click the edit icon** (✏️ pencil) in the action buttons
4. **Type your remark** in the input field that appears
5. **Press Enter** or click outside to save
6. **Your remark appears** below the word with a violet pencil icon

### Remark Examples
```
"serendipity" → "That lucky bookstore find last summer!"
"ephemeral" → "Like morning dew - beautiful but temporary"
"gregarious" → "My extroverted cousin at family gatherings"
"ubiquitous" → "Smartphones in 2025 - everywhere!"
```

### Remark Management
- **Edit anytime**: Click the pencil icon to modify remarks
- **Remove remarks**: Save an empty remark to delete it
- **Live updates**: Changes appear instantly in word lists
- **Visual indicator**: Violet pencil icon shows words with remarks
- **Search integration**: Remarks don't affect search but help with context

### Remark Tips
- **Keep it personal**: Use associations that work for you
- **Be concise**: Short notes are easier to scan
- **Use triggers**: Include memory hooks or images
- **Track progress**: Note when you feel confident with a word
- **Context matters**: Include where you encountered the word

---

## 🔍 Finding & Exploring Words

### Search Functionality
- **Type any part** of a word to search instantly
- **Real-time suggestions** appear as you type
- **Exact matches** show a search icon instead of generate
- **Click suggestions** to view existing words

### Word Discovery
1. **Click any word** in your list to view details
2. **Explore tags** by clicking colored tag buttons
3. **Follow synonyms/antonyms** to discover new words
4. **Use the right panel** to see related words by category

### Navigation
- **Word list** (left): Your saved words
- **Word details** (center): Current word information
- **Related words** (right): Associated words and tags

---

## 🏷️ Organizing with Tags

### Tag System
- **AI-generated tags**: Automatically suggested when adding words
- **Custom categories**: Group words by topic, difficulty, etc.
- **Color coding**: Visual organization with tag colors
- **Tag exploration**: Click any tag to find all related words

### Tag Examples
- `noun`, `verb`, `adjective` - Parts of speech
- `advanced`, `intermediate`, `beginner` - Difficulty levels
- `business`, `academic`, `casual` - Usage contexts
- `favorites`, `review`, `mastered` - Learning progress

---

## 👤 Profile Management

### Creating Profiles
1. **Click the "⋯" button** (more actions) in the header
2. **Click "Add Profile"** (plus icon)
3. **Enter a profile name** (e.g., "Spanish", "Medical Terms")
4. **Click "Create"**

### Switching Profiles
1. **Use the profile dropdown** in the header
2. **Select any profile** to switch instantly
3. **Each profile** has its own separate word collection

### Profile Use Cases
- **Language learning**: Separate profiles for each language
- **Subject areas**: Medical, legal, technical terms
- **Learning levels**: Beginner, intermediate, advanced
- **Personal collections**: Favorite words, quotes, etc.

---

## ⚙️ Settings & Configuration

### Accessing Settings
1. **Click the gear icon** (⚙️) in the header
2. **Configure your AI assistant**

### AI Configuration
Choose your AI provider and model:

#### OpenAI Setup
- **Provider**: Select "OpenAI"
- **Model**: `gpt-4`, `gpt-3.5-turbo`, etc.
- **API Endpoint**: `https://api.openai.com/v1`
- **API Key**: Your OpenAI API key

#### Google Setup
- **Provider**: Select "Google"
- **Model**: `gemini-pro`, `gemini-pro-vision`, etc.
- **API Endpoint**: `https://generativelanguage.googleapis.com`
- **API Key**: Your Google AI API key

### System Prompt
Customize how the AI explains words:
```
You are a helpful assistant that explains word meanings clearly and provides useful examples for language learners.
```

---

## 💾 Import & Export

### Exporting Profiles
1. **Click the "⋯" button** in the header
2. **Click "Export Profile"** (download icon)
3. **Choose save location**
4. **File saves as**: `[profile-name].db`

### Importing Profiles
1. **Click the "⋯" button** in the header
2. **Click "Import Profile"** (upload icon)
3. **Select a `.db` file** to import
4. **New profile** created automatically

### Backup Strategy
- **Regular exports**: Backup your learning progress
- **Profile separation**: Keep different subjects organized
- **Cross-device sync**: Import on different computers

---

## 🎨 Interface Guide

### Layout Overview
```
┌─────────────────────────────────────────────────┐
│ EverEtch v1.3.6          [Profile ▼]  ⚙️ ⋯     │  ← Header
├─────────────────┬─────────────────┬─────────────┤
│                 │                 │             │
│   Word List     │  Word Details   │  Related    │
│   (Saved)       │  (Current)      │  Words      │
│                 │                 │             │
├─────────────────┴─────────────────┴─────────────┤
│                                                 │
│   [Input Field]                    [Generate]   │  ← Input Area
│                                                 │
└─────────────────────────────────────────────────┘
```

### Panel Functions
- **Left Panel**: Your word collection with search/filter
- **Center Panel**: Detailed word information and editing
- **Right Panel**: Related words discovered through tags
- **Bottom Bar**: Word input and generation controls

### Keyboard Shortcuts
- **Enter**: Generate word or search existing
- **Click tags**: Explore related words
- **Double-click words**: Quick view
- **Drag panels**: Resize interface sections

---

## 📊 Learning Tips

### Effective Word Learning
1. **Start small**: Add 5-10 words per session
2. **Use tags**: Organize by difficulty or topic
3. **Review regularly**: Use tags to find words to review
4. **Explore connections**: Follow synonyms and antonyms
5. **Build vocabulary**: Let AI suggest related words

### Study Techniques
- **Spaced repetition**: Review words at increasing intervals
- **Context learning**: See words in AI-generated examples
- **Tag-based review**: Study by topic or difficulty
- **Progress tracking**: Use custom tags for learning stages

### Advanced Features
- **Bulk operations**: Import/export for sharing collections
- **Multi-profile**: Separate learning tracks
- **AI customization**: Adjust prompts for your learning style
- **Tag exploration**: Discover word relationships

---

## 🔧 Troubleshooting

### Common Issues

#### "Failed to generate meaning"
- Check your internet connection
- Verify API key is correct
- Ensure API endpoint is accessible
- Try switching to a different AI model

#### "Word not found"
- Check spelling
- Try partial words for search
- Use the generate function for new words

#### "Profile not loading"
- Restart the application
- Check if profile files exist
- Try creating a new profile

#### "Tags not working"
- Refresh the word details
- Regenerate the word to get new tags
- Check AI configuration

### Performance Tips
- **Large collections**: Use search instead of scrolling
- **Slow generation**: Try simpler AI models
- **Memory usage**: Close unused profiles
- **Storage space**: Regular backups and cleanup

---

## 🎯 Pro Tips

### Power User Features
1. **Tag chaining**: Click tags → explore → add related words
2. **Profile switching**: Keep different subjects separate
3. **Custom prompts**: Tailor AI explanations to your level
4. **Bulk learning**: Import curated word lists

### Learning Strategies
- **Thematic learning**: Group words by topic
- **Progressive difficulty**: Use tags for skill levels
- **Context immersion**: Study AI-generated examples
- **Active recall**: Test yourself with search function

### Organization Hacks
- **Color coding**: Use tag colors for visual organization
- **Naming conventions**: Consistent tag naming
- **Profile themes**: Language-specific collections
- **Progress tags**: Track learning milestones

---

## 📞 Support & Resources

### Getting Help
- **Check this guide** first for common questions
- **Review settings** for configuration issues
- **Try different AI models** if generation fails
- **Export/import** for data recovery

### Data Safety
- **Local storage**: Your data stays on your device
- **No cloud sync**: Complete privacy
- **Backup regularly**: Export profiles for safety
- **Multiple profiles**: Risk isolation

---

## 🎉 Happy Learning!

EverEtch is designed to make word learning enjoyable and effective. Experiment with different features, customize your setup, and build your vocabulary systematically.

**Remember**: Consistent, small daily sessions are more effective than occasional cramming!

---

*Last updated: December 2025*
*EverEtch v1.3.6*
