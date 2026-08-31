const fs = require("fs");
const path = require("path");

const backupCode = fs.readFileSync(path.join(__dirname, "../studio-web/data/course-data.backup.js"), "utf8");
global.window = {};
eval(backupCode);

const communities = window.COMMUNITIES_DATA;

// 1. Devin Jatho Course (33 lessons)
const devinCourse = {
  "id": "devin-jatho-editing-masterclass",
  "community": "Ultimate editors",
  "courseTitle": "Devin Jatho Editing Masterclass",
  "subtitle": "Domina el estilo de edición dinámica de Devin Jatho: tipografías, animación de elementos UI, hooks visuales y animaciones 3D.",
  "bannerTag": "1080P FULL HD · COMPLETO",
  "totalModules": 4,
  "totalLessons": 33,
  "totalResources": 0,
  "modules": [
    {
      "index": 1,
      "folder": "01_General",
      "title": "General & Bienvenida",
      "lessons": [
        {"id": "devin_les_01", "slug": "devin_01", "index": 1, "globalIndex": 1, "title": "01. Introduction -- Devin Jatho Masterclass", "rawTitle": "Introduction -- Devin Jatho Masterclass", "module": "01_General", "moduleIndex": 1, "gdriveId": "1JY0rfMHVEM0uaEyGPDsMtvZnK48G1X02", "gdriveLink": "https://drive.google.com/file/d/1JY0rfMHVEM0uaEyGPDsMtvZnK48G1X02/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_02", "slug": "devin_02", "index": 2, "globalIndex": 2, "title": "02. The Devin Jatho Style Inspiration Page", "rawTitle": "The Devin Jatho Style Inspiration Page", "module": "01_General", "moduleIndex": 1, "gdriveId": "1viBSBwxz68ZDRnsN_7z8d8E59jEJj-xm", "gdriveLink": "https://drive.google.com/file/d/1viBSBwxz68ZDRnsN_7z8d8E59jEJj-xm/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 2,
      "folder": "02_Understanding the Editing Style",
      "title": "Understanding the Editing Style",
      "lessons": [
        {"id": "devin_les_03", "slug": "devin_03", "index": 1, "globalIndex": 3, "title": "03. From an Editor's Perspective...", "rawTitle": "From an Editor's Perspective...", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1E2j1lVm1hkzoVWjZZURO2EoQQWfdR7A7", "gdriveLink": "https://drive.google.com/file/d/1E2j1lVm1hkzoVWjZZURO2EoQQWfdR7A7/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_04", "slug": "devin_04", "index": 2, "globalIndex": 4, "title": "04. Editing Style Breakdown (Process)", "rawTitle": "Editing Style Breakdown (Process)", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "186y4csSlUJr8ygfzrFIu-u4J3-uFAfJz", "gdriveLink": "https://drive.google.com/file/d/186y4csSlUJr8ygfzrFIu-u4J3-uFAfJz/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_05", "slug": "devin_05", "index": 3, "globalIndex": 5, "title": "05. Choosing Color Palettes & Fonts", "rawTitle": "Choosing Color Palettes & Fonts", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1gOS7cQSsJ0eg86yUfDPEehCyoXiShE2I", "gdriveLink": "https://drive.google.com/file/d/1gOS7cQSsJ0eg86yUfDPEehCyoXiShE2I/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_06", "slug": "devin_06", "index": 4, "globalIndex": 6, "title": "06. Collecting Creative Inspiration (Animations)", "rawTitle": "Collecting Creative Inspiration (Animations)", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1JIW-DbEbOAJK1NPyKJ_6kiTDlhTsBdfR", "gdriveLink": "https://drive.google.com/file/d/1JIW-DbEbOAJK1NPyKJ_6kiTDlhTsBdfR/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_07", "slug": "devin_07", "index": 5, "globalIndex": 7, "title": "07. Categorizing Animation Plans", "rawTitle": "Categorizing Animation Plans", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1mlFXztckMbdQBdUWGnscO3GB1IWDVT5T", "gdriveLink": "https://drive.google.com/file/d/1mlFXztckMbdQBdUWGnscO3GB1IWDVT5T/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_08", "slug": "devin_08", "index": 6, "globalIndex": 8, "title": "08. Creativity & New Animation Concepts", "rawTitle": "Creativity & New Animation Concepts", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1_aIAAoND-H6-aUT6D5o4j3l47W3mRY8C", "gdriveLink": "https://drive.google.com/file/d/1_aIAAoND-H6-aUT6D5o4j3l47W3mRY8C/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_09", "slug": "devin_09", "index": 7, "globalIndex": 9, "title": "09. Practice Creating an Editing Style", "rawTitle": "Practice Creating an Editing Style", "module": "02_Understanding the Editing Style", "moduleIndex": 2, "gdriveId": "1cIZ5KB1gNWfXryYTM6zws4yhMUoOULFq", "gdriveLink": "https://drive.google.com/file/d/1cIZ5KB1gNWfXryYTM6zws4yhMUoOULFq/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 3,
      "folder": "03_Mastering Devin's Hook Editing",
      "title": "Mastering Devin's Hook Editing",
      "lessons": [
        {"id": "devin_les_10", "slug": "devin_10", "index": 1, "globalIndex": 10, "title": "10. Generating Subtitles & Set-Up", "rawTitle": "Generating Subtitles & Set-Up", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1HHfHQlTSO-gpXXF22-B3NojcPZHIzMBO", "gdriveLink": "https://drive.google.com/file/d/1HHfHQlTSO-gpXXF22-B3NojcPZHIzMBO/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_11", "slug": "devin_11", "index": 2, "globalIndex": 11, "title": "11. Minimal White Devin Text", "rawTitle": "Minimal White Devin Text", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1LMcni99d8XUN_x304rnr6btlDZKOGenH", "gdriveLink": "https://drive.google.com/file/d/1LMcni99d8XUN_x304rnr6btlDZKOGenH/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_12", "slug": "devin_12", "index": 3, "globalIndex": 12, "title": "12. Special Devin Text Style (Design)", "rawTitle": "Special Devin Text Style (Design)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1PdwwDe5gj5PArKPASJPmZwyHf5FLpjQK", "gdriveLink": "https://drive.google.com/file/d/1PdwwDe5gj5PArKPASJPmZwyHf5FLpjQK/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_13", "slug": "devin_13", "index": 4, "globalIndex": 13, "title": "13. Special Devin Text Style (Effects)", "rawTitle": "Special Devin Text Style (Effects)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "104G6ewbedcyhCs2OFcZ0HE3ll13crQl4", "gdriveLink": "https://drive.google.com/file/d/104G6ewbedcyhCs2OFcZ0HE3ll13crQl4/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_14", "slug": "devin_14", "index": 5, "globalIndex": 14, "title": "14. Practice Creating Your Own Text Styles", "rawTitle": "Practice Creating Your Own Text Styles", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1Xt3ODdbIqJUl2xhl8e8s2yfNf_NGkoyo", "gdriveLink": "https://drive.google.com/file/d/1Xt3ODdbIqJUl2xhl8e8s2yfNf_NGkoyo/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_15", "slug": "devin_15", "index": 6, "globalIndex": 15, "title": "15. Icon Hook Animations (Basic)", "rawTitle": "Icon Hook Animations (Basic)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1WrzzSgabm-oi1eRXaNMBN_oE_YhFy8ZB", "gdriveLink": "https://drive.google.com/file/d/1WrzzSgabm-oi1eRXaNMBN_oE_YhFy8ZB/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_16", "slug": "devin_16", "index": 7, "globalIndex": 16, "title": "16. Icon Hook Animations (Advanced)", "rawTitle": "Icon Hook Animations (Advanced)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1nQzBGUZnP2IuH8BmJ0ODk8yTkx9vrs48", "gdriveLink": "https://drive.google.com/file/d/1nQzBGUZnP2IuH8BmJ0ODk8yTkx9vrs48/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_17", "slug": "devin_17", "index": 8, "globalIndex": 17, "title": "17. Practice Creating Icon Hook Animations", "rawTitle": "Practice Creating Icon Hook Animations", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1T8jEwaK3T5gLyjyoAhQ8z5RaZpdhxDsh", "gdriveLink": "https://drive.google.com/file/d/1T8jEwaK3T5gLyjyoAhQ8z5RaZpdhxDsh/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_18", "slug": "devin_18", "index": 9, "globalIndex": 18, "title": "18. UI Hook Animations (Basic)", "rawTitle": "UI Hook Animations (Basic)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1NaA8C1MwG6B5RcCQLhw0E4CZ7mnz0yTf", "gdriveLink": "https://drive.google.com/file/d/1NaA8C1MwG6B5RcCQLhw0E4CZ7mnz0yTf/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_19", "slug": "devin_19", "index": 10, "globalIndex": 19, "title": "19. UI Hook Animations (Advanced)", "rawTitle": "UI Hook Animations (Advanced)", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1H1U3K6Q3j-e10Q5cf48QCtRAISAzWJRw", "gdriveLink": "https://drive.google.com/file/d/1H1U3K6Q3j-e10Q5cf48QCtRAISAzWJRw/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_20", "slug": "devin_20", "index": 11, "globalIndex": 20, "title": "20. Practice Creating UI Hook Animations", "rawTitle": "Practice Creating UI Hook Animations", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1HAHkwnlwszPOhCQD1Vs9vKQLt2KyAxkf", "gdriveLink": "https://drive.google.com/file/d/1HAHkwnlwszPOhCQD1Vs9vKQLt2KyAxkf/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_21", "slug": "devin_21", "index": 12, "globalIndex": 21, "title": "21. Complete Instagram UI Animation", "rawTitle": "Complete Instagram UI Animation", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1jWFWI57_g3jJi-qrQD3m9E_b1lETFf6n", "gdriveLink": "https://drive.google.com/file/d/1jWFWI57_g3jJi-qrQD3m9E_b1lETFf6n/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_22", "slug": "devin_22", "index": 13, "globalIndex": 22, "title": "22. Practice Instagram UI Animations", "rawTitle": "Practice Instagram UI Animations", "module": "03_Mastering Devin's Hook Editing", "moduleIndex": 3, "gdriveId": "1uE5uMQveFIPAY2mLsty8pqEnT1VRGm2J", "gdriveLink": "https://drive.google.com/file/d/1uE5uMQveFIPAY2mLsty8pqEnT1VRGm2J/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 4,
      "folder": "04_Mastering Devin's Body Editing",
      "title": "Mastering Devin's Body Editing",
      "lessons": [
        {"id": "devin_les_23", "slug": "devin_23", "index": 1, "globalIndex": 23, "title": "23. Devin's Body Animations", "rawTitle": "Devin's Body Animations", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1DY7u43ZFb9EVojWkBe4BMIJY7OicE7yJ", "gdriveLink": "https://drive.google.com/file/d/1DY7u43ZFb9EVojWkBe4BMIJY7OicE7yJ/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_24", "slug": "devin_24", "index": 2, "globalIndex": 24, "title": "24. The Circle Selector Animation", "rawTitle": "The Circle Selector Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1805evuEsDFjmb7j4d0ZG9Z-uGRVXiVex", "gdriveLink": "https://drive.google.com/file/d/1805evuEsDFjmb7j4d0ZG9Z-uGRVXiVex/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_25", "slug": "devin_25", "index": 3, "globalIndex": 25, "title": "25. Making The Circle Interactive", "rawTitle": "Making The Circle Interactive", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1Rn5XftX-RLb9ap0GddXpkP9VPL9sLVm0", "gdriveLink": "https://drive.google.com/file/d/1Rn5XftX-RLb9ap0GddXpkP9VPL9sLVm0/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_26", "slug": "devin_26", "index": 4, "globalIndex": 26, "title": "26. The 3D Reel Animation", "rawTitle": "The 3D Reel Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1wp93D56NBwtpV-uEpc3F0mPxWw8g1Ws7", "gdriveLink": "https://drive.google.com/file/d/1wp93D56NBwtpV-uEpc3F0mPxWw8g1Ws7/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_27", "slug": "devin_27", "index": 5, "globalIndex": 27, "title": "27. Making the 3D Reel Interactive", "rawTitle": "Making the 3D Reel Interactive", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1fliuCKDs-tYAuUeQqoc2f0-XlsCYEVEc", "gdriveLink": "https://drive.google.com/file/d/1fliuCKDs-tYAuUeQqoc2f0-XlsCYEVEc/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_28", "slug": "devin_28", "index": 6, "globalIndex": 28, "title": "28. Practice Create a Special Selector Animation", "rawTitle": "Practice Create a Special Selector Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1emhX7QGHGMYrOs6z8b-I6UwjaFQ0ssVN", "gdriveLink": "https://drive.google.com/file/d/1emhX7QGHGMYrOs6z8b-I6UwjaFQ0ssVN/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_29", "slug": "devin_29", "index": 7, "globalIndex": 29, "title": "29. An Instagram UI Animation", "rawTitle": "An Instagram UI Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1w9ce9-bBEKJOggT7eBiR9pzPTvsh6Pb-", "gdriveLink": "https://drive.google.com/file/d/1w9ce9-bBEKJOggT7eBiR9pzPTvsh6Pb-/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_30", "slug": "devin_30", "index": 8, "globalIndex": 30, "title": "30. Turn Anything Into a UI Animation", "rawTitle": "Turn Anything Into a UI Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "11SzV_TWOUqJvIPwzemQOJj_KmJY4XVEy", "gdriveLink": "https://drive.google.com/file/d/11SzV_TWOUqJvIPwzemQOJj_KmJY4XVEy/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_31", "slug": "devin_31", "index": 9, "globalIndex": 31, "title": "31. Split-Screen Animation (Special)", "rawTitle": "Split-Screen Animation (Special)", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "11AvN6s6U59S26iifwsS98sd1d7-hnHOf", "gdriveLink": "https://drive.google.com/file/d/11AvN6s6U59S26iifwsS98sd1d7-hnHOf/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_32", "slug": "devin_32", "index": 10, "globalIndex": 32, "title": "32. 3D Character Animations (Special)", "rawTitle": "3D Character Animations (Special)", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1EOBaE5KuWi4DtaC_th3hXdoHIUnu6suD", "gdriveLink": "https://drive.google.com/file/d/1EOBaE5KuWi4DtaC_th3hXdoHIUnu6suD/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "devin_les_33", "slug": "devin_33", "index": 11, "globalIndex": 33, "title": "33. Practice Create a UI Special Animation", "rawTitle": "Practice Create a UI Special Animation", "module": "04_Mastering Devin's Body Editing", "moduleIndex": 4, "gdriveId": "1PMy0Dsabl9dYp9JIRxKjDS9V2q-UDHR-", "gdriveLink": "https://drive.google.com/file/d/1PMy0Dsabl9dYp9JIRxKjDS9V2q-UDHR-/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    }
  ]
};

// 2. Bymaximise Course (25 lessons)
const bymaximiseCourse = {
  "id": "bymaximise-editing-masterclass",
  "community": "Ultimate editors",
  "courseTitle": "Bymaximise Editing Masterclass",
  "subtitle": "Aprende el estilo de edición limpio (Clean Editing Style) de Bymaximise: narrativa, colocación de textos, SFX cinemáticos e intros icónicas.",
  "bannerTag": "1080P FULL HD · COMPLETO",
  "totalModules": 7,
  "totalLessons": 25,
  "totalResources": 0,
  "modules": [
    {
      "index": 1,
      "folder": "01_General",
      "title": "General & Bienvenida",
      "lessons": [
        {"id": "bymax_les_01", "slug": "bymax_01", "index": 1, "globalIndex": 1, "title": "01. Welcome to the Clean Editing Style Masterclass!", "rawTitle": "Welcome to the Clean Editing Style Masterclass!", "module": "01_General", "moduleIndex": 1, "gdriveId": "1MKHahmgA4jprzhwnvD0MUH0voXsyFgyu", "gdriveLink": "https://drive.google.com/file/d/1MKHahmgA4jprzhwnvD0MUH0voXsyFgyu/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 2,
      "folder": "02_The Breakdown & Planning",
      "title": "The Breakdown & Planning",
      "lessons": [
        {"id": "bymax_les_02", "slug": "bymax_02", "index": 1, "globalIndex": 2, "title": "02. Breaking Down Cinematic Clean Editing", "rawTitle": "Breaking Down Cinematic Clean Editing", "module": "02_The Breakdown & Planning", "moduleIndex": 2, "gdriveId": "1w2VcvT_G5tVf_q6l9_8k28NznbNz9KLe", "gdriveLink": "https://drive.google.com/file/d/1w2VcvT_G5tVf_q6l9_8k28NznbNz9KLe/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_03", "slug": "bymax_03", "index": 2, "globalIndex": 3, "title": "03. Planning Your Story & Workflow", "rawTitle": "Planning Your Story & Workflow", "module": "02_The Breakdown & Planning", "moduleIndex": 2, "gdriveId": "1ezhFMbWvyDo8UoQihH3KFphnMyOJafNI", "gdriveLink": "https://drive.google.com/file/d/1ezhFMbWvyDo8UoQihH3KFphnMyOJafNI/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 3,
      "folder": "03_Story Telling Secrets",
      "title": "Story Telling Secrets",
      "lessons": [
        {"id": "bymax_les_04", "slug": "bymax_04", "index": 1, "globalIndex": 4, "title": "04. Clip Selection & Merging Segments", "rawTitle": "Clip Selection & Merging Segments", "module": "03_Story Telling Secrets", "moduleIndex": 3, "gdriveId": "1zulKL8Qsc3W0ukOuoO8qVXtVQwOe42HG", "gdriveLink": "https://drive.google.com/file/d/1zulKL8Qsc3W0ukOuoO8qVXtVQwOe42HG/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_05", "slug": "bymax_05", "index": 2, "globalIndex": 5, "title": "05. Story Telling with Shot Selection", "rawTitle": "Story Telling with Shot Selection", "module": "03_Story Telling Secrets", "moduleIndex": 3, "gdriveId": "1fVIZrJME5Y5vlLj3ZcfL1MaGjIXyNB9Y", "gdriveLink": "https://drive.google.com/file/d/1fVIZrJME5Y5vlLj3ZcfL1MaGjIXyNB9Y/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_06", "slug": "bymax_06", "index": 3, "globalIndex": 6, "title": "06. Emotionally Motivating Music", "rawTitle": "Emotionally Motivating Music", "module": "03_Story Telling Secrets", "moduleIndex": 3, "gdriveId": "16zD5xUyAKJq5k1n7E45W3EkALjy4JBpy", "gdriveLink": "https://drive.google.com/file/d/16zD5xUyAKJq5k1n7E45W3EkALjy4JBpy/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_07", "slug": "bymax_07", "index": 4, "globalIndex": 7, "title": "07. Tie it all Together", "rawTitle": "Tie it all Together", "module": "03_Story Telling Secrets", "moduleIndex": 3, "gdriveId": "1-vNiaaBOKWAebkVwqEhfOAEfRm4VzjCB", "gdriveLink": "https://drive.google.com/file/d/1-vNiaaBOKWAebkVwqEhfOAEfRm4VzjCB/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 4,
      "folder": "04_Text Stylization & Animations",
      "title": "Text Stylization & Animations",
      "lessons": [
        {"id": "bymax_les_08", "slug": "bymax_08", "index": 1, "globalIndex": 8, "title": "08. Font Selection Guide", "rawTitle": "Font Selection Guide", "module": "04_Text Stylization & Animations", "moduleIndex": 4, "gdriveId": "1F0yIJlwugRC99apWQb-rI44MO-nVvtkA", "gdriveLink": "https://drive.google.com/file/d/1F0yIJlwugRC99apWQb-rI44MO-nVvtkA/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_09", "slug": "bymax_09", "index": 2, "globalIndex": 9, "title": "09. Text Stylization & Types", "rawTitle": "Text Stylization & Types", "module": "04_Text Stylization & Animations", "moduleIndex": 4, "gdriveId": "1DlNZSMk0MQJLYK0Kx8quxo4PwjcMiWW8", "gdriveLink": "https://drive.google.com/file/d/1DlNZSMk0MQJLYK0Kx8quxo4PwjcMiWW8/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_10", "slug": "bymax_10", "index": 3, "globalIndex": 10, "title": "10. The Three Animations", "rawTitle": "The Three Animations", "module": "04_Text Stylization & Animations", "moduleIndex": 4, "gdriveId": "1-SzJN6QVDCCqXi88fbS47QwemVGet3QD", "gdriveLink": "https://drive.google.com/file/d/1-SzJN6QVDCCqXi88fbS47QwemVGet3QD/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_11", "slug": "bymax_11", "index": 4, "globalIndex": 11, "title": "11. Commonly Used Text Effects", "rawTitle": "Commonly Used Text Effects", "module": "04_Text Stylization & Animations", "moduleIndex": 4, "gdriveId": "1p2K8zChHJGkXu9EpLnVA_I7CbQhYCPxd", "gdriveLink": "https://drive.google.com/file/d/1p2K8zChHJGkXu9EpLnVA_I7CbQhYCPxd/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 5,
      "folder": "05_Footage and Text Placement",
      "title": "Footage and Text Placement",
      "lessons": [
        {"id": "bymax_les_12", "slug": "bymax_12", "index": 1, "globalIndex": 12, "title": "12. Text Placement Theory", "rawTitle": "Text Placement Theory", "module": "05_Footage and Text Placement", "moduleIndex": 5, "gdriveId": "1ackBIIrQK-bfGSsjmHf86nQkt3HauZPP", "gdriveLink": "https://drive.google.com/file/d/1ackBIIrQK-bfGSsjmHf86nQkt3HauZPP/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_13", "slug": "bymax_13", "index": 2, "globalIndex": 13, "title": "13. Placement & Workflow", "rawTitle": "Placement & Workflow", "module": "05_Footage and Text Placement", "moduleIndex": 5, "gdriveId": "1w4WqhFF992mmWSunFVZs6_Nh-OcLFtbq", "gdriveLink": "https://drive.google.com/file/d/1w4WqhFF992mmWSunFVZs6_Nh-OcLFtbq/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_14", "slug": "bymax_14", "index": 3, "globalIndex": 14, "title": "14. Rotoscoping & Text Placement", "rawTitle": "Rotoscoping & Text Placement", "module": "05_Footage and Text Placement", "moduleIndex": 5, "gdriveId": "1gSm1-xGySz3ry2J4MZIgm3E4wefe2-BM", "gdriveLink": "https://drive.google.com/file/d/1gSm1-xGySz3ry2J4MZIgm3E4wefe2-BM/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_15", "slug": "bymax_15", "index": 4, "globalIndex": 15, "title": "15. Combining it All Together", "rawTitle": "Combining it All Together", "module": "05_Footage and Text Placement", "moduleIndex": 5, "gdriveId": "1Pv_9wHiPfUF1mImb_EDd2wm0kf-lnqeo", "gdriveLink": "https://drive.google.com/file/d/1Pv_9wHiPfUF1mImb_EDd2wm0kf-lnqeo/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 6,
      "folder": "06_Advanced Sound Design",
      "title": "Advanced Sound Design",
      "lessons": [
        {"id": "bymax_les_16", "slug": "bymax_016", "index": 1, "globalIndex": 16, "title": "16. The High Quality SFX Folder", "rawTitle": "The High Quality SFX Folder", "module": "06_Advanced Sound Design", "moduleIndex": 6, "gdriveId": "1lfq8BT-WUaQoMtPXLWTosDQNPXFOochg", "gdriveLink": "https://drive.google.com/file/d/1lfq8BT-WUaQoMtPXLWTosDQNPXFOochg/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_17", "slug": "bymax_017", "index": 2, "globalIndex": 17, "title": "17. Less is More Mentality", "rawTitle": "Less is More Mentality", "module": "06_Advanced Sound Design", "moduleIndex": 6, "gdriveId": "1EwHzqRf-19H5DKKpuFtRo6rjD9hzpKxt", "gdriveLink": "https://drive.google.com/file/d/1EwHzqRf-19H5DKKpuFtRo6rjD9hzpKxt/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_18", "slug": "bymax_018", "index": 3, "globalIndex": 18, "title": "18. Cinematic Clicks & Camera SFX", "rawTitle": "Cinematic Clicks & Camera SFX", "module": "06_Advanced Sound Design", "moduleIndex": 6, "gdriveId": "1XMCWbVyoFTvFzbNOMVtXTAcfHKnRSzzk", "gdriveLink": "https://drive.google.com/file/d/1XMCWbVyoFTvFzbNOMVtXTAcfHKnRSzzk/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_19", "slug": "bymax_019", "index": 4, "globalIndex": 19, "title": "19. Environmental SFX & Layering", "rawTitle": "Environmental SFX & Layering", "module": "06_Advanced Sound Design", "moduleIndex": 6, "gdriveId": "1Sn5H4tQ3NstOkWgP4FcvSKu0cKJsnEX2", "gdriveLink": "https://drive.google.com/file/d/1Sn5H4tQ3NstOkWgP4FcvSKu0cKJsnEX2/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_20", "slug": "bymax_020", "index": 5, "globalIndex": 20, "title": "20. Emotionally Captivating Sound Design", "rawTitle": "Emotionally Captivating Sound Design", "module": "06_Advanced Sound Design", "moduleIndex": 6, "gdriveId": "1ukVx6gRa7QJnu9187yBKYazQ-wc5fTRQ", "gdriveLink": "https://drive.google.com/file/d/1ukVx6gRa7QJnu9187yBKYazQ-wc5fTRQ/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    },
    {
      "index": 7,
      "folder": "07_Common Bymaximise Intros",
      "title": "Common Bymaximise Intros",
      "lessons": [
        {"id": "bymax_les_21", "slug": "bymax_021", "index": 1, "globalIndex": 21, "title": "21. 3D Text Tracking Intro", "rawTitle": "3D Text Tracking Intro", "module": "07_Common Bymaximise Intros", "moduleIndex": 7, "gdriveId": "1a_pOGrfLj7vF13NG_iRPzXMB3ModT4P5", "gdriveLink": "https://drive.google.com/file/d/1a_pOGrfLj7vF13NG_iRPzXMB3ModT4P5/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_22", "slug": "bymax_022", "index": 2, "globalIndex": 22, "title": "22. Old Tv Screen + Write Out Intro", "rawTitle": "Old Tv Screen + Write Out Intro", "module": "07_Common Bymaximise Intros", "moduleIndex": 7, "gdriveId": "1McoctnKpqlsZ_YOmpB6CAS7OEDjcHy_A", "gdriveLink": "https://drive.google.com/file/d/1McoctnKpqlsZ_YOmpB6CAS7OEDjcHy_A/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_23", "slug": "bymax_023", "index": 3, "globalIndex": 23, "title": "23. Zoom Back + White Background Intro", "rawTitle": "Zoom Back + White Background Intro", "module": "07_Common Bymaximise Intros", "moduleIndex": 7, "gdriveId": "1rARAXuwSTOE-PfmmP9zgO-dU10g_LXJ0", "gdriveLink": "https://drive.google.com/file/d/1rARAXuwSTOE-PfmmP9zgO-dU10g_LXJ0/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_24", "slug": "bymax_024", "index": 4, "globalIndex": 24, "title": "24. Hour Masterclass on Clean Editing!", "rawTitle": "Hour Masterclass on Clean Editing!", "module": "07_Common Bymaximise Intros", "moduleIndex": 7, "gdriveId": "1LdF1xu1jSsmRHQqli-1noRIxUXSJuGlB", "gdriveLink": "https://drive.google.com/file/d/1LdF1xu1jSsmRHQqli-1noRIxUXSJuGlB/view?usp=drivesdk", "inDrive": true, "resources": []},
        {"id": "bymax_les_25", "slug": "bymax_025", "index": 5, "globalIndex": 25, "title": "25. A 1 Hour Guide to Editing Like Eleven Stoic", "rawTitle": "A 1 Hour Guide to Editing Like Eleven Stoic", "module": "07_Common Bymaximise Intros", "moduleIndex": 7, "gdriveId": "1Yx__dMxJRLJri65RbfikP5VWBkcnN06r", "gdriveLink": "https://drive.google.com/file/d/1Yx__dMxJRLJri65RbfikP5VWBkcnN06r/view?usp=drivesdk", "inDrive": true, "resources": []}
      ]
    }
  ]
};

let ultimateComm = communities.find(c => c.id === "ultimateeditors" || c.name === "Ultimate editors");
if (!ultimateComm) {
  ultimateComm = {
    id: "ultimateeditors",
    name: "Ultimate editors",
    badge: "ACADEMIA & COMUNIDAD",
    description: "Comunidad de edición y formaciones especializadas.",
    courses: []
  };
  communities.push(ultimateComm);
}

// Add or update Devin Jatho
const devinIdx = ultimateComm.courses.findIndex(c => c.id === "devin-jatho-editing-masterclass");
if (devinIdx !== -1) ultimateComm.courses[devinIdx] = devinCourse;
else ultimateComm.courses.push(devinCourse);

// Add or update Bymaximise
const bymaxIdx = ultimateComm.courses.findIndex(c => c.id === "bymaximise-editing-masterclass");
if (bymaxIdx !== -1) ultimateComm.courses[bymaxIdx] = bymaximiseCourse;
else ultimateComm.courses.push(bymaximiseCourse);

const finalCode = "window.COMMUNITIES_DATA = " + JSON.stringify(communities, null, 2) + ";\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n";
fs.writeFileSync(path.join(__dirname, "../studio-web/data/course-data.js"), finalCode, "utf8");

let totalCourses = 0;
let totalL = 0;
communities.forEach(c => {
  console.log("Community:", c.name);
  c.courses.forEach(crs => {
    totalCourses++;
    totalL += crs.totalLessons || 0;
    console.log("  - Course:", crs.courseTitle, "(", crs.totalLessons, "clases )");
  });
});
console.log(`✅ TOTAL: ${communities.length} comunidades · ${totalCourses} cursos · ${totalL} clases totales!`);
