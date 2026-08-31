const fs = require("fs");
const path = require("path");

const backupCode = fs.readFileSync(path.join(__dirname, "../studio-web/data/course-data.backup.js"), "utf8");
global.window = {};
eval(backupCode);

const communities = window.COMMUNITIES_DATA;

const devinCourse = {
  "id": "devin-jatho-editing-masterclass",
  "community": "Ultimate editors",
  "courseTitle": "Devin Jatho Editing Masterclass",
  "subtitle": "Domina el estilo de edición dinámica de Devin Jatho: tipografías, animación de elementos UI, hooks visuales y animaciones 3D.",
  "bannerTag": "1080P FULL HD · EN DRIVE",
  "totalModules": 4,
  "totalLessons": 33,
  "totalResources": 0,
  "modules": [
    {
      "index": 1,
      "folder": "01_General",
      "title": "General & Bienvenida",
      "lessons": [
        {
          "id": "devin_les_01",
          "slug": "devin_01",
          "index": 1,
          "globalIndex": 1,
          "title": "01. Introduction -- Devin Jatho Masterclass",
          "rawTitle": "Introduction -- Devin Jatho Masterclass",
          "module": "01_General",
          "moduleIndex": 1,
          "gdriveId": "1JY0rfMHVEM0uaEyGPDsMtvZnK48G1X02",
          "gdriveLink": "https://drive.google.com/file/d/1JY0rfMHVEM0uaEyGPDsMtvZnK48G1X02/view?usp=drivesdk",
          "inDrive": true,
          "resources": []
        },
        {
          "id": "devin_les_02",
          "slug": "devin_02",
          "index": 2,
          "globalIndex": 2,
          "title": "02. The Devin Jatho Style Inspiration Page",
          "rawTitle": "The Devin Jatho Style Inspiration Page",
          "module": "01_General",
          "moduleIndex": 1,
          "gdriveId": "1viBSBwxz68ZDRnsN_7z8d8E59jEJj-xm",
          "gdriveLink": "https://drive.google.com/file/d/1viBSBwxz68ZDRnsN_7z8d8E59jEJj-xm/view?usp=drivesdk",
          "inDrive": true,
          "resources": []
        }
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

const existingIdx = ultimateComm.courses.findIndex(c => c.id === "devin-jatho-editing-masterclass");
if (existingIdx !== -1) {
  ultimateComm.courses[existingIdx] = devinCourse;
} else {
  ultimateComm.courses.push(devinCourse);
}

const finalCode = "window.COMMUNITIES_DATA = " + JSON.stringify(communities, null, 2) + ";\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n";
fs.writeFileSync(path.join(__dirname, "../studio-web/data/course-data.js"), finalCode, "utf8");

let totalL = 0;
communities.forEach(c => {
  console.log("Community:", c.name);
  c.courses.forEach(crs => {
    totalL += crs.totalLessons || 0;
    console.log("  - Course:", crs.courseTitle, "(", crs.totalLessons, "clases )");
  });
});
console.log("✅ TOTAL LESSONS ACROSS ALL COURSES:", totalL);
