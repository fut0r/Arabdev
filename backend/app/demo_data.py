"""Optional demo content for local development (python -m app.cli seed --demo).

All accounts are fictional. Never run this against a production database.
"""

DEMO_PASSWORD = "ArabDev2026"  # noqa: S105 - published in the README for local demo accounts
# Fictional accounts get addresses on a subdomain ArabDev controls, so no real person receives mail.
DEMO_EMAIL_DOMAIN = "demo.arabdev.site"

DEMO_USERS = [
    (
        "layla_dev",
        "ليلى حسن",
        "مهندسة واجهات أمامية، أكتب عن React وإمكانية الوصول وتفاصيل الواجهات الصغيرة.",
        "الرياض",
        ["react", "typescript", "javascript", "ui-ux"],
    ),
    (
        "omar_rs",
        "Omar Khatib",
        "Systems programmer. Rust, Linux, and the occasional kernel panic.",
        "Amman",
        ["rust", "linux", "cpp", "open-source"],
    ),
    (
        "sara_ml",
        "سارة المنصوري",
        "باحثة في تعلّم الآلة. أحب شرح الأفكار المعقدة بأمثلة صغيرة.",
        "دبي",
        ["python", "machine-learning", "ai"],
    ),
    (
        "yousef_ops",
        "يوسف العلي",
        "مهندس DevOps. أتمتة، مراقبة، وأنظمة لا توقظني في الثالثة فجرًا.",
        "القاهرة",
        ["devops", "cloud", "linux", "go"],
    ),
    (
        "nour_sec",
        "نور الدين",
        "أمن سيبراني واختبار اختراق أخلاقي. أكتب عن الأخطاء التي نكررها.",
        "الدار البيضاء",
        ["cybersecurity", "linux", "python"],
    ),
    (
        "hamza_api",
        "Hamza Youssef",
        "Backend developer. FastAPI, Django and a healthy respect for database indexes.",
        "Tunis",
        ["fastapi", "django", "python", "databases"],
    ),
    (
        "mariam_mobile",
        "مريم سالم",
        "مطورة تطبيقات جوال. أهتم بالأداء على الأجهزة المتوسطة.",
        "جدة",
        ["mobile-development", "java", "ui-ux"],
    ),
    (
        "khaled_games",
        "Khaled Ibrahim",
        "Game developer (C++ and C#). Shipping small games, slowly.",
        "Beirut",
        ["game-development", "cpp", "csharp"],
    ),
    (
        "rana_js",
        "رنا عادل",
        "Node.js و TypeScript، وأحيانًا Vue. أحب الأدوات التي تختفي عن الطريق.",
        "الكويت",
        ["nodejs", "typescript", "vue", "javascript"],
    ),
    (
        "adam_cloud",
        "Adam Fares",
        "Cloud architect. I write about cost and reliability, not hype.",
        "Doha",
        ["cloud", "devops", "databases"],
    ),
]

# (author, days_ago, title, html, tags, link)
DEMO_POSTS = [
    (
        "hamza_api",
        0.2,
        "Pagination that doesn't lie to your users",
        "<p>Offset pagination is fine until your table grows. Three rules I follow on every API:</p>"
        "<ol><li><p>Always return <code>total</code> and <code>pages</code> so the UI can render real page numbers.</p></li>"
        "<li><p>Cap <code>limit</code> on the server. Clients will ask for 10,000 rows eventually.</p></li>"
        "<li><p>Order by a unique column last, or rows will jump between pages.</p></li></ol>"
        '<pre><code class="language-python">stmt = select(Post).order_by(Post.created_at.desc(), Post.id.desc())\n'
        "items = db.scalars(stmt.limit(limit).offset((page - 1) * limit)).all()</code></pre>",
        ["fastapi", "databases", "python"],
        None,
    ),
    (
        "layla_dev",
        0.4,
        "زر بدون نص ليس زرًا",
        "<p>كل أيقونة قابلة للنقر تحتاج اسمًا يُقرأ. قارئ الشاشة لا يرى القلب الأحمر، بل يقرأ <code>button</code> فقط.</p>"
        '<h2>الحل البسيط</h2><p>أضف <code>aria-label</code> يصف <strong>الفعل</strong> لا الشكل: "أعجبني" وليس "قلب".</p>'
        '<pre><code class="language-tsx">&lt;IconButton aria-label="إضافة إلى المحفوظات"&gt;\n  &lt;BookmarkIcon /&gt;\n&lt;/IconButton&gt;</code></pre>'
        "<p>واختبر بلوحة المفاتيح فقط لمدة خمس دقائق. ستتفاجأ.</p>",
        ["react", "ui-ux", "accessibility"],
        None,
    ),
    (
        "omar_rs",
        0.7,
        "Why my Rust service stopped allocating in the hot path",
        "<p>We had a parser that allocated a <code>String</code> per field. Switching to borrowed slices cut p99 latency by 40%.</p>"
        "<pre><code class=\"language-rust\">fn fields(line: &amp;str) -&gt; impl Iterator&lt;Item = &amp;str&gt; {\n    line.split(',').map(str::trim)\n}</code></pre>"
        "<p>The borrow checker complained for a day. Then it was right.</p>",
        ["rust", "performance"],
        "https://doc.rust-lang.org/book/ch04-03-slices.html",
    ),
    (
        "sara_ml",
        1.1,
        "الانحدار الخطي في عشرة أسطر",
        "<p>قبل أي مكتبة، افهم ما تفعله. هذا انحدار خطي بالنزول التدريجي باستخدام NumPy فقط:</p>"
        '<pre><code class="language-python">w, b = 0.0, 0.0\nfor _ in range(1000):\n    pred = w * x + b\n    w -= lr * ((pred - y) * x).mean()\n    b -= lr * (pred - y).mean()</code></pre>'
        "<p>إذا فهمت هذه الحلقة، فهمت نصف ما يحدث داخل الشبكات العصبية.</p>",
        ["machine-learning", "python"],
        None,
    ),
    (
        "yousef_ops",
        1.4,
        "خمس علامات على أن تنبيهاتك مزعجة أكثر من اللازم",
        "<ul><li><p>تنبيه لا يتطلب أي إجراء.</p></li><li><p>نفس التنبيه يصل لثلاثة أشخاص.</p></li>"
        "<li><p>تنبيهات على استهلاك المعالج بدل تجربة المستخدم.</p></li><li><p>لا أحد يعرف من يملك الخدمة.</p></li>"
        "<li><p>الفريق يكتم القناة.</p></li></ul><p>ابدأ من أهداف مستوى الخدمة (SLO)، ونبّه على استهلاك ميزانية الأخطاء فقط.</p>",
        ["devops", "monitoring"],
        None,
    ),
    (
        "nour_sec",
        1.9,
        "كلمات المرور ليست مكانها ملف .env في المستودع",
        "<p>ما زلت أرى مفاتيح API في مستودعات عامة كل أسبوع. قاعدة واحدة: <strong>أي سر دخل git قد تسرّب</strong>، حتى لو حذفته.</p>"
        "<h2>ماذا تفعل إذا حدث ذلك؟</h2><ol><li><p>ألغِ المفتاح فورًا وأنشئ غيره.</p></li>"
        "<li><p>أضف <code>.env</code> إلى <code>.gitignore</code>.</p></li><li><p>فعّل فحص الأسرار في CI.</p></li></ol>",
        ["cybersecurity", "git"],
        None,
    ),
    (
        "rana_js",
        2.2,
        "Node.js 22 وملفات .env بدون مكتبات",
        "<p>منذ Node 20.6 يمكنك تحميل ملف البيئة مباشرة:</p>"
        '<pre><code class="language-bash">node --env-file=.env server.js</code></pre>'
        "<p>أقل اعتمادًا على الحزم يعني أقل تحديثات أمنية تطاردها.</p>",
        ["nodejs", "javascript"],
        "https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs",
    ),
    (
        "adam_cloud",
        2.6,
        "Your cloud bill is an architecture diagram",
        "<p>Before optimizing, sort your bill by service and read the top five lines out loud to the team.</p>"
        "<table><tbody><tr><th><p>Line item</p></th><th><p>Usual cause</p></th><th><p>First fix</p></th></tr>"
        "<tr><td><p>Data transfer</p></td><td><p>Cross-zone chatter</p></td><td><p>Co-locate services</p></td></tr>"
        "<tr><td><p>Idle compute</p></td><td><p>Dev environments left on</p></td><td><p>Schedules</p></td></tr>"
        "<tr><td><p>Storage</p></td><td><p>Snapshots nobody owns</p></td><td><p>Lifecycle rules</p></td></tr></tbody></table>",
        ["cloud", "devops"],
        None,
    ),
    (
        "mariam_mobile",
        3.0,
        "اختبر تطبيقك على هاتف متوسط، لا على هاتفك",
        "<p>أغلب مستخدمينا في المنطقة يستخدمون أجهزة متوسطة أو قديمة. هاتفك الرائد يخفي مشاكل الأداء.</p>"
        "<p>احتفظ بجهاز اختبار رخيص على مكتبك وافتح التطبيق عليه كل يوم.</p>",
        ["mobile-development", "performance"],
        None,
    ),
    (
        "khaled_games",
        3.3,
        "Fixed timestep, or why my physics exploded at 144 Hz",
        "<p>If your physics step uses the frame delta directly, faster monitors change the simulation. Accumulate time and step at a fixed rate:</p>"
        '<pre><code class="language-cpp">accumulator += frameTime;\nwhile (accumulator &gt;= dt) {\n    world.step(dt);\n    accumulator -= dt;\n}</code></pre>',
        ["game-development", "cpp"],
        "https://gafferongames.com/post/fix_your_timestep/",
    ),
    (
        "layla_dev",
        3.8,
        "Logical CSS properties make RTL almost free",
        "<p>Stop writing <code>margin-left</code>. Use <code>margin-inline-start</code> and the layout flips itself for Arabic.</p>"
        "<table><tbody><tr><th><p>Physical</p></th><th><p>Logical</p></th></tr>"
        "<tr><td><p>margin-left</p></td><td><p>margin-inline-start</p></td></tr>"
        "<tr><td><p>padding-right</p></td><td><p>padding-inline-end</p></td></tr>"
        "<tr><td><p>left: 0</p></td><td><p>inset-inline-start: 0</p></td></tr></tbody></table>",
        ["css", "ui-ux", "rtl"],
        None,
    ),
    (
        "hamza_api",
        4.1,
        "لا تثق في التحقق من جهة الواجهة وحده",
        "<p>التحقق في الواجهة لتجربة المستخدم، والتحقق في الخادم للأمان. كل حقل يصل إلى الـ API يجب أن يُتحقق منه مرة أخرى.</p>"
        '<pre><code class="language-python">class RegisterIn(BaseModel):\n    username: str\n    email: EmailStr\n\n    _username = field_validator("username")(normalize_username)</code></pre>',
        ["fastapi", "security"],
        None,
    ),
    (
        "omar_rs",
        4.6,
        "أول مساهمة لي في مشروع مفتوح المصدر كانت تصحيح خطأ إملائي",
        "<p>ولا عيب في ذلك. المساهمة الصغيرة تعلّمك طريقة عمل المشروع: كيف يُراجَع الكود، وما أسلوب الرسائل، ومن يقرر.</p>"
        "<p>ابحث عن وسم <code>good first issue</code> وابدأ اليوم.</p>",
        ["open-source"],
        None,
    ),
    (
        "sara_ml",
        5.0,
        "Evaluation sets rot too",
        "<p>If your test set was collected two years ago, your model may be great at a world that no longer exists. Refresh a slice of it every quarter.</p>",
        ["machine-learning", "ai"],
        None,
    ),
    (
        "yousef_ops",
        5.5,
        "Dockerfile صغير = نشر أسرع",
        "<p>استخدم البناء متعدد المراحل واترك أدوات البناء خارج الصورة النهائية:</p>"
        '<pre><code class="language-dockerfile">FROM node:22 AS build\nWORKDIR /app\nCOPY . .\nRUN npm ci &amp;&amp; npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html</code></pre>',
        ["devops", "docker"],
        None,
    ),
    (
        "nour_sec",
        6.0,
        "Rate limiting is a feature, not an afterthought",
        "<p>Login, password reset and search endpoints are the first things attackers script. Limit them per IP and per account from day one.</p>",
        ["cybersecurity", "backend"],
        None,
    ),
    (
        "rana_js",
        6.4,
        "TypeScript: استخدم satisfies بدل as",
        "<p><code>as</code> تُسكت المترجم، و <code>satisfies</code> تجعله يتحقق دون أن تفقد النوع الدقيق.</p>"
        "<pre><code class=\"language-ts\">const routes = {\n  home: '/',\n  explore: '/explore',\n} satisfies Record&lt;string, string&gt;;</code></pre>",
        ["typescript"],
        None,
    ),
    (
        "adam_cloud",
        7.0,
        "Backups you haven't restored are hopes",
        "<p>Schedule a restore drill. Time it. Write down every manual step. That document is your real recovery plan.</p>",
        ["databases", "cloud"],
        None,
    ),
    (
        "mariam_mobile",
        7.5,
        "Accessibility on mobile starts with touch targets",
        "<p>48×48 dp minimum. Icons can be smaller, their tappable area cannot.</p>",
        ["mobile-development", "ui-ux"],
        None,
    ),
    (
        "khaled_games",
        8.2,
        "أنهيت لعبتي الأولى بعد ثلاث سنوات",
        "<p>الدرس الأهم: قلّص الفكرة إلى النصف، ثم إلى النصف مرة أخرى. اللعبة الصغيرة المنشورة أفضل من الكبيرة التي لا تنتهي.</p>",
        ["game-development"],
        None,
    ),
    (
        "layla_dev",
        9.0,
        "useEffect ليست مكانًا لحساب القيم",
        "<p>إذا كانت القيمة تُشتق من الـ props أو الحالة، احسبها أثناء العرض. <code>useEffect</code> للتزامن مع أنظمة خارجية فقط.</p>",
        ["react", "javascript"],
        "https://react.dev/learn/you-might-not-need-an-effect",
    ),
    (
        "hamza_api",
        10.0,
        "Indexes I add on day one",
        "<ul><li><p>Every foreign key.</p></li><li><p>Every column in a unique constraint (it's already there, check it).</p></li>"
        "<li><p><code>(author_id, created_at)</code> for profile timelines.</p></li><li><p><code>created_at</code> for feeds.</p></li></ul>",
        ["databases", "backend"],
        None,
    ),
    (
        "sara_ml",
        11.0,
        "لماذا لا تكفي الدقة (Accuracy) وحدها؟",
        '<p>في بيانات غير متوازنة، نموذج يقول "لا" دائمًا قد يحقق دقة 99٪. انظر إلى الدقة والاستدعاء (Precision و Recall) معًا.</p>',
        ["machine-learning"],
        None,
    ),
    (
        "omar_rs",
        12.5,
        "Linux: find what's eating your disk in one line",
        '<pre><code class="language-bash">du -xh / 2&gt;/dev/null | sort -rh | head -20</code></pre><p>Then check <code>journalctl --disk-usage</code>. It\'s usually the logs.</p>',
        ["linux"],
        None,
    ),
    (
        "nour_sec",
        14.0,
        "المصادقة الثنائية لحساب GitHub ليست اختيارية",
        "<p>حسابك على GitHub هو مفتاح لكل خادم تنشر إليه. فعّل المصادقة الثنائية واستخدم مفاتيح الأمان إن أمكن.</p>",
        ["cybersecurity", "git"],
        None,
    ),
    (
        "yousef_ops",
        16.0,
        "Go for small internal tools",
        "<p>One static binary, no runtime to install, cross-compiles from a laptop. For internal CLIs it's hard to beat.</p>",
        ["go", "devops"],
        None,
    ),
]

# (commenter, post index, text)
DEMO_COMMENTS = [
    ("omar_rs", 0, "The tie-breaker on id is the one everyone forgets."),
    ("rana_js", 0, "وماذا عن cursor pagination للجداول الضخمة؟"),
    ("hamza_api", 0, "@rana_js للجداول الضخمة نعم، لكن أرقام الصفحات أوضح للمستخدم في أغلب الواجهات."),
    ("mariam_mobile", 1, "نفس المشكلة موجودة في تطبيقات الجوال مع TalkBack."),
    ("sara_ml", 2, "Nice. Did you measure memory as well?"),
    ("layla_dev", 3, "شرح ممتاز، سأشاركه مع فريقي."),
    ("adam_cloud", 4, "Error budgets changed how our on-call works."),
    ("hamza_api", 5, "ونصيحة إضافية: استخدم pre-commit hook لفحص الأسرار."),
    ("yousef_ops", 7, "Snapshots nobody owns — painfully accurate."),
    ("khaled_games", 9, "Gaffer's article is the classic reference for this."),
    ("rana_js", 10, "Tailwind has logical utilities too: ms-4, pe-2."),
    ("nour_sec", 11, "بالضبط، والتحقق من الصلاحيات أيضًا في الخادم."),
]

# (follower, followee)
DEMO_FOLLOWS = [
    ("layla_dev", "rana_js"),
    ("layla_dev", "mariam_mobile"),
    ("layla_dev", "hamza_api"),
    ("omar_rs", "yousef_ops"),
    ("omar_rs", "nour_sec"),
    ("omar_rs", "khaled_games"),
    ("sara_ml", "hamza_api"),
    ("sara_ml", "adam_cloud"),
    ("yousef_ops", "adam_cloud"),
    ("yousef_ops", "omar_rs"),
    ("yousef_ops", "nour_sec"),
    ("nour_sec", "omar_rs"),
    ("nour_sec", "hamza_api"),
    ("hamza_api", "sara_ml"),
    ("hamza_api", "rana_js"),
    ("hamza_api", "adam_cloud"),
    ("mariam_mobile", "layla_dev"),
    ("mariam_mobile", "khaled_games"),
    ("khaled_games", "omar_rs"),
    ("khaled_games", "mariam_mobile"),
    ("rana_js", "layla_dev"),
    ("rana_js", "hamza_api"),
    ("adam_cloud", "yousef_ops"),
    ("adam_cloud", "sara_ml"),
]

# (user, post index)
DEMO_REPOSTS = [("yousef_ops", 0), ("layla_dev", 10), ("omar_rs", 5), ("adam_cloud", 21)]
