import { useState, useEffect, useCallback, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { Clipboard } from "@capacitor/clipboard";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

// ═══ PLATFORM-AWARE HELPERS ═══
const isNative = Capacitor.isNativePlatform();

// API endpoint — backend proxy (not direct to Anthropic)
const API_BASE = isNative
  ? "https://www.trolliiapp.com"  // Production API when running as native app
  : ""; // Same origin when running as web app

// Open external URL — uses in-app browser on native for affiliate tracking
const openExternal = async (url) => {
  if (isNative) {
    await Browser.open({ url, presentationStyle: "popover" });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

// Persistent storage — Capacitor Preferences on native, localStorage on web
const storage = {
  async get(key) {
    try {
      if (isNative) {
        const { value } = await Preferences.get({ key });
        return value ? JSON.parse(value) : null;
      }
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  async set(key, value) {
    try {
      const v = JSON.stringify(value);
      if (isNative) {
        await Preferences.set({ key, value: v });
      } else {
        localStorage.setItem(key, v);
      }
    } catch {}
  },
};

// Native share with fallback
const shareText = async (title, text) => {
  try {
    if (isNative) {
      await Share.share({ title, text, dialogTitle: title });
    } else if (navigator.share) {
      await navigator.share({ title, text });
    } else {
      await copyToClipboard(text);
    }
  } catch {}
};

// Copy to clipboard
const copyToClipboard = async (text) => {
  try {
    if (isNative) {
      await Clipboard.write({ string: text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch { return false; }
};

// Save file
const saveFile = async (filename, content, mimeType) => {
  try {
    if (isNative) {
      await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: filename,
        text: `Shopping list exported from Trollii`,
        url: `file://${filename}`,
        dialogTitle: "Save or share file",
      }).catch(() => {});
    } else {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch {}
};


const MEALS_DB = [
  { id:1,name:"Grilled Chicken & Roasted Vegetables",category:"Protein-Rich",health:9,tags:["gluten-free"],
    method:["Season chicken breasts with salt, pepper, and olive oil.","Chop broccoli, bell peppers, and garlic.","Roast vegetables at 200°C/400°F for 20 mins.","Grill chicken for 6-7 mins each side until cooked through.","Serve chicken sliced over the roasted vegetables."],
    baseIngredients:[{name:"Chicken Breast",amount:"500g",basePrice:5.50,aisle:"Meat"},{name:"Broccoli",amount:"1 head",basePrice:1.20,aisle:"Produce"},{name:"Bell Peppers",amount:"3",basePrice:2.10,aisle:"Produce"},{name:"Olive Oil",amount:"2 tbsp",basePrice:0.40,aisle:"Oils"},{name:"Garlic",amount:"3 cloves",basePrice:0.30,aisle:"Produce"}]},
  { id:2,name:"Turkey Meatballs with Pasta",category:"Protein-Rich",health:7,tags:[],
    method:["Mix turkey mince with breadcrumbs, egg, and seasoning. Roll into balls.","Fry meatballs until browned all over, about 8 mins.","Simmer passata with garlic and basil for 10 mins.","Cook penne pasta according to packet instructions.","Add meatballs to sauce, serve over pasta with fresh basil."],
    baseIngredients:[{name:"Turkey Mince",amount:"500g",basePrice:4.00,aisle:"Meat"},{name:"Penne Pasta",amount:"400g",basePrice:1.20,aisle:"Pasta & Rice"},{name:"Passata",amount:"500g",basePrice:0.90,aisle:"Tinned Goods"},{name:"Breadcrumbs",amount:"50g",basePrice:0.40,aisle:"Bakery"},{name:"Egg",amount:"1",basePrice:0.30,aisle:"Dairy"},{name:"Basil",amount:"bunch",basePrice:0.70,aisle:"Produce"}]},
  { id:3,name:"Lemon Herb Chicken Thighs",category:"Protein-Rich",health:8,tags:["gluten-free"],
    method:["Marinate chicken thighs with lemon juice, rosemary, salt and pepper.","Halve new potatoes and toss in olive oil.","Roast potatoes at 200°C for 15 mins, then add chicken.","Roast together for 25-30 mins until golden.","Steam green beans and serve alongside."],
    baseIngredients:[{name:"Chicken Thighs",amount:"600g",basePrice:4.20,aisle:"Meat"},{name:"Lemon",amount:"2",basePrice:0.80,aisle:"Produce"},{name:"Fresh Rosemary",amount:"sprigs",basePrice:0.60,aisle:"Produce"},{name:"New Potatoes",amount:"500g",basePrice:1.00,aisle:"Produce"},{name:"Green Beans",amount:"200g",basePrice:1.20,aisle:"Produce"}]},
  { id:4,name:"Steak with Peppercorn Sauce",category:"Protein-Rich",health:7,tags:["gluten-free"],
    method:["Season steaks generously with salt.","Sear in a very hot pan for 3-4 mins each side for medium.","Rest steaks for 5 mins while making sauce.","Crush peppercorns, toast in pan, add cream and reduce.","Serve with chips and salad."],
    baseIngredients:[{name:"Sirloin Steak",amount:"2 x 250g",basePrice:8.00,aisle:"Meat"},{name:"Double Cream",amount:"150ml",basePrice:0.90,aisle:"Dairy"},{name:"Peppercorns",amount:"1 tbsp",basePrice:0.30,aisle:"Spices"},{name:"Chips/Fries",amount:"500g",basePrice:1.50,aisle:"Frozen"},{name:"Salad Leaves",amount:"100g",basePrice:1.00,aisle:"Produce"}]},
  { id:5,name:"Spaghetti Bolognese",category:"Classic",health:6,tags:[],
    method:["Finely dice onion, carrot, and garlic.","Brown beef mince in a large pan, breaking up lumps.","Add diced vegetables and cook for 5 mins.","Pour in tinned tomatoes, season, and simmer for 30 mins.","Cook spaghetti and serve topped with sauce."],
    baseIngredients:[{name:"Beef Mince",amount:"500g",basePrice:5.00,aisle:"Meat"},{name:"Spaghetti",amount:"400g",basePrice:1.50,aisle:"Pasta & Rice"},{name:"Tinned Tomatoes",amount:"400g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Garlic",amount:"2 cloves",basePrice:0.20,aisle:"Produce"},{name:"Carrot",amount:"1",basePrice:0.20,aisle:"Produce"}]},
  { id:6,name:"Beef Tacos",category:"Classic",health:6,tags:["gluten-free"],
    method:["Brown beef mince with taco seasoning.","Warm taco shells in the oven for 3 mins.","Shred lettuce and dice tomatoes.","Grate cheese and prepare sour cream.","Fill shells with beef, top with salad, cheese and cream."],
    baseIngredients:[{name:"Beef Mince",amount:"400g",basePrice:4.50,aisle:"Meat"},{name:"Corn Taco Shells",amount:"8 pack",basePrice:1.80,aisle:"World Foods"},{name:"Lettuce",amount:"1/2 head",basePrice:0.50,aisle:"Produce"},{name:"Tomatoes",amount:"2",basePrice:0.60,aisle:"Produce"},{name:"Cheddar Cheese",amount:"100g",basePrice:1.50,aisle:"Dairy"},{name:"Sour Cream",amount:"150ml",basePrice:1.00,aisle:"Dairy"}]},
  { id:7,name:"Shepherd's Pie",category:"Classic",health:6,tags:["gluten-free"],
    method:["Peel and boil potatoes until tender, then mash with butter.","Brown lamb mince with diced onion and carrots.","Add peas and stock, simmer for 15 mins.","Transfer to a baking dish, top with mashed potato.","Bake at 200°C for 25 mins until golden on top."],
    baseIngredients:[{name:"Lamb Mince",amount:"500g",basePrice:5.50,aisle:"Meat"},{name:"Potatoes",amount:"700g",basePrice:1.00,aisle:"Produce"},{name:"Carrots",amount:"2",basePrice:0.30,aisle:"Produce"},{name:"Frozen Peas",amount:"150g",basePrice:0.80,aisle:"Frozen"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Butter",amount:"30g",basePrice:0.25,aisle:"Dairy"}]},
  { id:8,name:"Chicken Fajitas",category:"Classic",health:7,tags:[],
    method:["Slice chicken, peppers and onion into strips.","Toss chicken with fajita spice and cook until golden.","Sauté peppers and onions until softened.","Warm tortillas in a dry pan or microwave.","Assemble with chicken, veg, and sour cream."],
    baseIngredients:[{name:"Chicken Breast",amount:"400g",basePrice:4.50,aisle:"Meat"},{name:"Flour Tortillas",amount:"8 pack",basePrice:1.50,aisle:"Bakery"},{name:"Bell Peppers",amount:"3",basePrice:2.10,aisle:"Produce"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Fajita Spice Mix",amount:"1 sachet",basePrice:0.60,aisle:"Spices"},{name:"Sour Cream",amount:"150ml",basePrice:1.00,aisle:"Dairy"}]},
  { id:9,name:"Fish & Chips",category:"Classic",health:5,tags:[],
    method:["Peel and cut potatoes into chips, par-boil for 5 mins.","Make batter with flour, water, and seasoning.","Heat oil to 180°C. Fry chips until golden.","Dip cod in batter and fry for 5-6 mins until crispy.","Serve with mushy peas and lemon wedges."],
    baseIngredients:[{name:"Cod Fillets",amount:"400g",basePrice:4.50,aisle:"Fish"},{name:"Plain Flour",amount:"200g",basePrice:0.30,aisle:"Baking"},{name:"Potatoes",amount:"600g",basePrice:0.80,aisle:"Produce"},{name:"Mushy Peas",amount:"300g",basePrice:0.70,aisle:"Tinned Goods"},{name:"Vegetable Oil",amount:"500ml",basePrice:1.20,aisle:"Oils"},{name:"Lemon",amount:"1",basePrice:0.40,aisle:"Produce"}]},
  { id:10,name:"Vegetable Stir Fry with Tofu",category:"Plant-Based",health:10,tags:["vegan","gluten-free"],
    method:["Press tofu for 15 mins, then cube and pan-fry until golden.","Cook rice according to packet instructions.","Stir fry mixed vegetables in sesame oil on high heat.","Add tamari and toss with tofu.","Serve over rice with extra tamari if desired."],
    baseIngredients:[{name:"Firm Tofu",amount:"400g",basePrice:2.50,aisle:"Chilled"},{name:"Mixed Stir Fry Veg",amount:"400g",basePrice:2.00,aisle:"Produce"},{name:"Tamari",amount:"2 tbsp",basePrice:0.40,aisle:"World Foods"},{name:"Rice",amount:"300g",basePrice:0.80,aisle:"Pasta & Rice"},{name:"Sesame Oil",amount:"1 tbsp",basePrice:0.25,aisle:"Oils"}]},
  { id:11,name:"Lentil & Vegetable Soup",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Dice onion, carrots, and celery.","Sauté in a large pot with a little oil for 5 mins.","Add red lentils and vegetable stock, bring to boil.","Simmer for 25 mins until lentils are soft.","Season well and blend partially for a chunky texture."],
    baseIngredients:[{name:"Red Lentils",amount:"250g",basePrice:1.00,aisle:"Pulses"},{name:"Carrots",amount:"3",basePrice:0.40,aisle:"Produce"},{name:"Celery",amount:"3 sticks",basePrice:0.50,aisle:"Produce"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Vegetable Stock",amount:"1L",basePrice:0.60,aisle:"Tinned Goods"}]},
  { id:12,name:"Chickpea & Spinach Curry",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Sauté diced onion until soft.","Add curry paste and cook for 1 min until fragrant.","Pour in coconut milk and drained chickpeas, simmer 15 mins.","Stir in spinach until wilted.","Serve over steamed rice."],
    baseIngredients:[{name:"Chickpeas",amount:"400g tin",basePrice:0.80,aisle:"Tinned Goods"},{name:"Coconut Milk",amount:"400ml",basePrice:1.20,aisle:"World Foods"},{name:"Spinach",amount:"200g",basePrice:1.00,aisle:"Produce"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Curry Paste",amount:"2 tbsp",basePrice:0.50,aisle:"World Foods"},{name:"Rice",amount:"300g",basePrice:0.80,aisle:"Pasta & Rice"}]},
  { id:13,name:"Bean & Avocado Burrito Bowl",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Cook rice and season with lime juice.","Heat black beans with cumin and a pinch of chilli.","Drain sweetcorn and warm through.","Slice avocado and prepare salsa.","Assemble bowls with rice, beans, corn, avocado and salsa."],
    baseIngredients:[{name:"Black Beans",amount:"400g tin",basePrice:0.80,aisle:"Tinned Goods"},{name:"Avocado",amount:"1",basePrice:1.50,aisle:"Produce"},{name:"Rice",amount:"200g",basePrice:0.50,aisle:"Pasta & Rice"},{name:"Sweetcorn",amount:"200g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Lime",amount:"1",basePrice:0.30,aisle:"Produce"},{name:"Salsa",amount:"100g",basePrice:1.20,aisle:"World Foods"}]},
  { id:14,name:"Roasted Cauliflower Steaks",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Cut cauliflower into thick steaks through the core.","Brush with olive oil, season generously.","Roast at 220°C for 25 mins until deeply golden.","Warm chickpeas with lemon juice and tahini.","Serve cauliflower over chickpeas with fresh salad."],
    baseIngredients:[{name:"Cauliflower",amount:"1 large",basePrice:1.20,aisle:"Produce"},{name:"Tahini",amount:"2 tbsp",basePrice:0.60,aisle:"World Foods"},{name:"Cherry Tomatoes",amount:"200g",basePrice:1.50,aisle:"Produce"},{name:"Chickpeas",amount:"400g tin",basePrice:0.80,aisle:"Tinned Goods"},{name:"Lemon",amount:"1",basePrice:0.40,aisle:"Produce"},{name:"Mixed Salad",amount:"100g",basePrice:1.00,aisle:"Produce"}]},
  { id:15,name:"Sweet Potato & Black Bean Chilli",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Peel and cube sweet potatoes.","Sauté onion, add chilli powder and cook 1 min.","Add sweet potato, black beans, and tinned tomatoes.","Simmer for 25 mins until sweet potato is tender.","Serve over rice with lime wedges."],
    baseIngredients:[{name:"Sweet Potatoes",amount:"2 large",basePrice:1.40,aisle:"Produce"},{name:"Black Beans",amount:"400g tin",basePrice:0.80,aisle:"Tinned Goods"},{name:"Tinned Tomatoes",amount:"400g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Chilli Powder",amount:"1 tsp",basePrice:0.15,aisle:"Spices"},{name:"Rice",amount:"300g",basePrice:0.80,aisle:"Pasta & Rice"}]},
  { id:16,name:"Vegan Pad Thai",category:"Plant-Based",health:8,tags:["vegan","gluten-free"],
    method:["Soak rice noodles in boiling water until tender.","Press and cube tofu, fry until crispy.","Make sauce with tamari, lime juice, and a touch of sugar.","Toss noodles with bean sprouts, spring onions and sauce.","Top with crushed peanuts and lime wedges."],
    baseIngredients:[{name:"Rice Noodles",amount:"300g",basePrice:1.40,aisle:"World Foods"},{name:"Firm Tofu",amount:"300g",basePrice:2.00,aisle:"Chilled"},{name:"Bean Sprouts",amount:"150g",basePrice:0.80,aisle:"Produce"},{name:"Peanuts",amount:"50g",basePrice:0.60,aisle:"Snacks"},{name:"Lime",amount:"2",basePrice:0.60,aisle:"Produce"},{name:"Spring Onions",amount:"bunch",basePrice:0.60,aisle:"Produce"}]},
  { id:17,name:"Mediterranean Roasted Veg & Couscous",category:"Plant-Based",health:8,tags:["vegan"],
    method:["Chop courgette, aubergine and peppers into chunks.","Toss with olive oil and roast at 200°C for 30 mins.","Prepare couscous with boiling water and cover for 5 mins.","Fluff couscous with a fork, mix in fresh mint.","Serve roasted veg over herby couscous."],
    baseIngredients:[{name:"Courgette",amount:"2",basePrice:1.00,aisle:"Produce"},{name:"Aubergine",amount:"1",basePrice:0.90,aisle:"Produce"},{name:"Bell Peppers",amount:"2",basePrice:1.40,aisle:"Produce"},{name:"Couscous",amount:"300g",basePrice:1.00,aisle:"Pasta & Rice"},{name:"Olive Oil",amount:"3 tbsp",basePrice:0.60,aisle:"Oils"},{name:"Fresh Mint",amount:"bunch",basePrice:0.70,aisle:"Produce"}]},
  { id:18,name:"Mushroom & Walnut Bolognese",category:"Plant-Based",health:8,tags:["vegan"],
    method:["Finely chop mushrooms and pulse walnuts in a blender.","Sauté onion and garlic until soft.","Add mushrooms and walnuts, cook until browned.","Pour in tinned tomatoes, simmer 20 mins.","Serve over spaghetti."],
    baseIngredients:[{name:"Mushrooms",amount:"400g",basePrice:1.60,aisle:"Produce"},{name:"Walnuts",amount:"100g",basePrice:1.50,aisle:"Baking"},{name:"Spaghetti",amount:"400g",basePrice:1.50,aisle:"Pasta & Rice"},{name:"Tinned Tomatoes",amount:"400g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Garlic",amount:"3 cloves",basePrice:0.30,aisle:"Produce"}]},
  { id:19,name:"Moroccan Vegetable Tagine",category:"Plant-Based",health:9,tags:["vegan","gluten-free"],
    method:["Peel and cube butternut squash.","Sauté onion, add ras el hanout and cook 1 min.","Add squash, chickpeas, tomatoes, and apricots.","Simmer for 30 mins until squash is tender.","Serve with fluffy couscous."],
    baseIngredients:[{name:"Chickpeas",amount:"400g tin",basePrice:0.80,aisle:"Tinned Goods"},{name:"Butternut Squash",amount:"1 small",basePrice:1.20,aisle:"Produce"},{name:"Dried Apricots",amount:"80g",basePrice:1.00,aisle:"Dried Fruit"},{name:"Tinned Tomatoes",amount:"400g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Ras El Hanout",amount:"2 tsp",basePrice:0.40,aisle:"Spices"},{name:"Couscous",amount:"200g",basePrice:0.70,aisle:"Pasta & Rice"}]},
  { id:20,name:"Mushroom Risotto",category:"Vegetarian",health:7,tags:["vegetarian","gluten-free"],
    method:["Slice mushrooms and sauté until golden. Set aside.","Sauté onion in butter, add arborio rice and stir 1 min.","Add stock a ladle at a time, stirring continuously.","When rice is creamy and tender (about 20 mins), stir in mushrooms.","Finish with parmesan and a knob of butter."],
    baseIngredients:[{name:"Arborio Rice",amount:"300g",basePrice:1.80,aisle:"Pasta & Rice"},{name:"Mushrooms",amount:"300g",basePrice:1.50,aisle:"Produce"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Vegetable Stock",amount:"1L",basePrice:0.60,aisle:"Tinned Goods"},{name:"Parmesan",amount:"50g",basePrice:1.20,aisle:"Dairy"},{name:"Butter",amount:"20g",basePrice:0.20,aisle:"Dairy"}]},
  { id:21,name:"Spinach & Ricotta Stuffed Shells",category:"Vegetarian",health:7,tags:["vegetarian"],
    method:["Cook pasta shells until just al dente.","Mix ricotta with wilted spinach, garlic and seasoning.","Spread passata in a baking dish.","Stuff each shell with the ricotta mixture, place in dish.","Top with mozzarella and bake at 190°C for 20 mins."],
    baseIngredients:[{name:"Conchiglioni Pasta",amount:"300g",basePrice:1.80,aisle:"Pasta & Rice"},{name:"Ricotta",amount:"250g",basePrice:1.60,aisle:"Dairy"},{name:"Spinach",amount:"200g",basePrice:1.00,aisle:"Produce"},{name:"Passata",amount:"500g",basePrice:0.90,aisle:"Tinned Goods"},{name:"Mozzarella",amount:"125g",basePrice:0.80,aisle:"Dairy"},{name:"Garlic",amount:"2 cloves",basePrice:0.20,aisle:"Produce"}]},
  { id:22,name:"Cheese & Onion Quiche with Salad",category:"Vegetarian",health:6,tags:["vegetarian"],
    method:["Line a tart tin with pastry and blind bake for 10 mins.","Caramelise sliced onions slowly over low heat.","Whisk eggs with cream and most of the cheese.","Layer onions in pastry, pour over egg mix, top with remaining cheese.","Bake at 180°C for 30 mins. Serve with mixed salad."],
    baseIngredients:[{name:"Shortcrust Pastry",amount:"1 roll",basePrice:1.20,aisle:"Chilled"},{name:"Eggs",amount:"4",basePrice:1.20,aisle:"Dairy"},{name:"Double Cream",amount:"200ml",basePrice:0.90,aisle:"Dairy"},{name:"Cheddar Cheese",amount:"150g",basePrice:1.80,aisle:"Dairy"},{name:"Onion",amount:"2",basePrice:0.50,aisle:"Produce"},{name:"Mixed Salad",amount:"100g",basePrice:1.00,aisle:"Produce"}]},
  { id:23,name:"Vegetable Lasagne",category:"Vegetarian",health:7,tags:["vegetarian"],
    method:["Slice courgettes and wilt spinach.","Layer passata, lasagne sheets, vegetables, and ricotta.","Repeat layers, finishing with mozzarella on top.","Bake at 190°C for 35-40 mins until golden and bubbling.","Rest for 10 mins before serving."],
    baseIngredients:[{name:"Lasagne Sheets",amount:"250g",basePrice:1.00,aisle:"Pasta & Rice"},{name:"Courgette",amount:"2",basePrice:1.00,aisle:"Produce"},{name:"Spinach",amount:"200g",basePrice:1.00,aisle:"Produce"},{name:"Ricotta",amount:"250g",basePrice:1.60,aisle:"Dairy"},{name:"Passata",amount:"500g",basePrice:0.90,aisle:"Tinned Goods"},{name:"Mozzarella",amount:"125g",basePrice:0.80,aisle:"Dairy"}]},
  { id:24,name:"Halloumi & Roasted Veg Wraps",category:"Vegetarian",health:7,tags:["vegetarian"],
    method:["Slice courgette and pepper, roast at 200°C for 20 mins.","Slice and grill halloumi until golden on each side.","Warm tortillas briefly.","Spread hummus on tortillas, add roasted veg and halloumi.","Add mixed leaves and roll up tightly."],
    baseIngredients:[{name:"Halloumi",amount:"250g",basePrice:2.50,aisle:"Dairy"},{name:"Flour Tortillas",amount:"6 pack",basePrice:1.20,aisle:"Bakery"},{name:"Courgette",amount:"1",basePrice:0.50,aisle:"Produce"},{name:"Bell Pepper",amount:"1",basePrice:0.70,aisle:"Produce"},{name:"Hummus",amount:"200g",basePrice:1.20,aisle:"Chilled"},{name:"Mixed Leaves",amount:"80g",basePrice:0.90,aisle:"Produce"}]},
  { id:25,name:"Egg Fried Rice",category:"Vegetarian",health:6,tags:["vegetarian","gluten-free"],
    method:["Cook rice and spread on a tray to cool completely.","Dice carrots and cook with peas in sesame oil.","Push veg aside, scramble eggs in the same pan.","Add cold rice, toss everything together on high heat.","Finish with sliced spring onions."],
    baseIngredients:[{name:"Rice",amount:"400g",basePrice:1.00,aisle:"Pasta & Rice"},{name:"Eggs",amount:"4",basePrice:1.20,aisle:"Dairy"},{name:"Frozen Peas",amount:"150g",basePrice:0.60,aisle:"Frozen"},{name:"Carrots",amount:"2",basePrice:0.30,aisle:"Produce"},{name:"Spring Onions",amount:"bunch",basePrice:0.60,aisle:"Produce"},{name:"Sesame Oil",amount:"1 tbsp",basePrice:0.25,aisle:"Oils"}]},
  { id:26,name:"Mac & Cheese",category:"Vegetarian",health:5,tags:["vegetarian"],
    method:["Cook macaroni until al dente.","Melt butter in a saucepan, stir in flour to make a roux.","Gradually add milk, stirring until smooth and thick.","Add most of the cheese and mustard, stir until melted.","Combine with pasta, top with remaining cheese, grill until golden."],
    baseIngredients:[{name:"Macaroni Pasta",amount:"400g",basePrice:1.00,aisle:"Pasta & Rice"},{name:"Cheddar Cheese",amount:"200g",basePrice:2.20,aisle:"Dairy"},{name:"Milk",amount:"400ml",basePrice:0.50,aisle:"Dairy"},{name:"Butter",amount:"30g",basePrice:0.25,aisle:"Dairy"},{name:"Plain Flour",amount:"30g",basePrice:0.10,aisle:"Baking"}]},
  { id:27,name:"Salmon with Sweet Potato Mash",category:"Fish",health:10,tags:["gluten-free"],
    method:["Peel and boil sweet potatoes until tender.","Mash with butter and season well.","Pan-fry salmon fillets skin-side down for 4 mins.","Flip and cook 3 more mins until just cooked through.","Steam green beans and serve with a lemon squeeze."],
    baseIngredients:[{name:"Salmon Fillets",amount:"2 fillets",basePrice:6.00,aisle:"Fish"},{name:"Sweet Potatoes",amount:"3",basePrice:1.80,aisle:"Produce"},{name:"Green Beans",amount:"200g",basePrice:1.20,aisle:"Produce"},{name:"Butter",amount:"1 tbsp",basePrice:0.20,aisle:"Dairy"},{name:"Lemon",amount:"1",basePrice:0.40,aisle:"Produce"}]},
  { id:28,name:"Baked Cod with Roasted Potatoes",category:"Fish",health:8,tags:["gluten-free"],
    method:["Cube potatoes and toss with olive oil, roast at 200°C for 20 mins.","Halve cherry tomatoes and add to potatoes.","Place cod fillets on top, drizzle with oil and herbs.","Bake for 12-15 mins until cod flakes easily.","Serve immediately with all the pan juices."],
    baseIngredients:[{name:"Cod Fillets",amount:"2 fillets",basePrice:4.50,aisle:"Fish"},{name:"Potatoes",amount:"500g",basePrice:0.80,aisle:"Produce"},{name:"Cherry Tomatoes",amount:"200g",basePrice:1.50,aisle:"Produce"},{name:"Olive Oil",amount:"2 tbsp",basePrice:0.40,aisle:"Oils"},{name:"Fresh Herbs",amount:"bunch",basePrice:0.80,aisle:"Produce"}]},
  { id:29,name:"Prawn Stir Fry Noodles",category:"Fish",health:7,tags:[],
    method:["Cook egg noodles according to packet, drain.","Stir-fry prawns with ginger until pink.","Add halved pak choi and cook 2 mins.","Toss in noodles with soy sauce and spring onions.","Serve immediately while hot."],
    baseIngredients:[{name:"Prawns",amount:"300g",basePrice:4.50,aisle:"Fish"},{name:"Egg Noodles",amount:"300g",basePrice:1.00,aisle:"World Foods"},{name:"Pak Choi",amount:"2 heads",basePrice:1.20,aisle:"Produce"},{name:"Soy Sauce",amount:"2 tbsp",basePrice:0.30,aisle:"World Foods"},{name:"Ginger",amount:"thumb",basePrice:0.30,aisle:"Produce"},{name:"Spring Onions",amount:"bunch",basePrice:0.60,aisle:"Produce"}]},
  { id:30,name:"Tuna Nicoise Salad",category:"Fish",health:9,tags:["gluten-free"],
    method:["Boil new potatoes and green beans until just tender.","Hard boil eggs for 8 mins, cool and halve.","Sear tuna steaks 2 mins each side for rare.","Arrange leaves, potatoes, beans, eggs and olives on plates.","Slice tuna and lay on top. Dress with olive oil and lemon."],
    baseIngredients:[{name:"Tuna Steaks",amount:"2",basePrice:5.00,aisle:"Fish"},{name:"New Potatoes",amount:"300g",basePrice:0.80,aisle:"Produce"},{name:"Green Beans",amount:"150g",basePrice:1.00,aisle:"Produce"},{name:"Eggs",amount:"2",basePrice:0.60,aisle:"Dairy"},{name:"Olives",amount:"80g",basePrice:1.00,aisle:"Tinned Goods"},{name:"Mixed Leaves",amount:"100g",basePrice:1.00,aisle:"Produce"}]},
  { id:31,name:"Teriyaki Salmon Bowl",category:"Fish",health:9,tags:["gluten-free"],
    method:["Marinate salmon in tamari, ginger, and a touch of honey.","Cook rice and prepare edamame beans.","Pan-fry or bake salmon for 10 mins.","Slice avocado.","Assemble bowls with rice, salmon, edamame, and avocado."],
    baseIngredients:[{name:"Salmon Fillets",amount:"2",basePrice:6.00,aisle:"Fish"},{name:"Rice",amount:"300g",basePrice:0.80,aisle:"Pasta & Rice"},{name:"Edamame Beans",amount:"150g",basePrice:1.50,aisle:"Frozen"},{name:"Avocado",amount:"1",basePrice:1.50,aisle:"Produce"},{name:"Tamari",amount:"3 tbsp",basePrice:0.50,aisle:"World Foods"},{name:"Ginger",amount:"thumb",basePrice:0.30,aisle:"Produce"}]},
  { id:32,name:"Chicken Caesar Salad",category:"Quick",health:7,tags:[],
    method:["Season and pan-fry chicken breast until cooked, then slice.","Wash and chop romaine lettuce.","Toss lettuce with caesar dressing.","Top with sliced chicken, croutons, and shaved parmesan.","Serve immediately."],
    baseIngredients:[{name:"Chicken Breast",amount:"300g",basePrice:3.50,aisle:"Meat"},{name:"Romaine Lettuce",amount:"1 head",basePrice:0.90,aisle:"Produce"},{name:"Parmesan",amount:"50g",basePrice:1.20,aisle:"Dairy"},{name:"Croutons",amount:"100g",basePrice:1.00,aisle:"Bakery"},{name:"Caesar Dressing",amount:"100ml",basePrice:1.50,aisle:"Chilled"}]},
  { id:33,name:"Omelette with Side Salad",category:"Quick",health:8,tags:["vegetarian","gluten-free"],
    method:["Beat eggs with seasoning.","Sauté mushrooms in butter until golden.","Pour eggs into a hot non-stick pan.","When nearly set, add cheese and mushrooms to one side.","Fold over and serve with tomato and leaf salad."],
    baseIngredients:[{name:"Eggs",amount:"6",basePrice:1.80,aisle:"Dairy"},{name:"Cheddar Cheese",amount:"80g",basePrice:1.00,aisle:"Dairy"},{name:"Mushrooms",amount:"100g",basePrice:0.80,aisle:"Produce"},{name:"Tomatoes",amount:"2",basePrice:0.60,aisle:"Produce"},{name:"Mixed Leaves",amount:"80g",basePrice:0.90,aisle:"Produce"},{name:"Butter",amount:"1 tbsp",basePrice:0.15,aisle:"Dairy"}]},
  { id:34,name:"Jacket Potato with Beans & Cheese",category:"Quick",health:6,tags:["vegetarian","gluten-free"],
    method:["Prick potatoes and bake at 200°C for 1 hour until crispy.","Heat baked beans in a saucepan.","Cut open potatoes and add butter.","Top generously with hot beans and grated cheese.","Serve with a simple side salad."],
    baseIngredients:[{name:"Baking Potatoes",amount:"4 large",basePrice:1.40,aisle:"Produce"},{name:"Baked Beans",amount:"400g",basePrice:0.50,aisle:"Tinned Goods"},{name:"Cheddar Cheese",amount:"150g",basePrice:1.80,aisle:"Dairy"},{name:"Butter",amount:"2 tbsp",basePrice:0.25,aisle:"Dairy"},{name:"Side Salad",amount:"100g",basePrice:1.00,aisle:"Produce"}]},
  { id:35,name:"Creamy Chicken Pasta Bake",category:"Comfort",health:6,tags:[],
    method:["Cook penne until al dente.","Dice and fry chicken with garlic until golden.","Add cream and sweetcorn, simmer 5 mins.","Mix with pasta, transfer to baking dish, top with cheese.","Bake at 190°C for 20 mins until golden and bubbling."],
    baseIngredients:[{name:"Chicken Breast",amount:"400g",basePrice:4.50,aisle:"Meat"},{name:"Penne Pasta",amount:"400g",basePrice:1.20,aisle:"Pasta & Rice"},{name:"Double Cream",amount:"300ml",basePrice:1.20,aisle:"Dairy"},{name:"Cheddar Cheese",amount:"100g",basePrice:1.50,aisle:"Dairy"},{name:"Sweetcorn",amount:"200g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Garlic",amount:"2 cloves",basePrice:0.20,aisle:"Produce"}]},
  { id:36,name:"Sausage Casserole",category:"Comfort",health:5,tags:["gluten-free"],
    method:["Brown sausages in a large pot.","Add sliced onion and cook until soft.","Pour in beans, tinned tomatoes, and cubed potatoes.","Season and simmer for 30 mins until potatoes are tender.","Serve hot straight from the pot."],
    baseIngredients:[{name:"Pork Sausages",amount:"8",basePrice:2.80,aisle:"Meat"},{name:"Baked Beans",amount:"400g",basePrice:0.50,aisle:"Tinned Goods"},{name:"Tinned Tomatoes",amount:"400g",basePrice:0.80,aisle:"Tinned Goods"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Potatoes",amount:"500g",basePrice:0.80,aisle:"Produce"}]},
  { id:37,name:"Thai Green Curry",category:"World",health:7,tags:["gluten-free"],
    method:["Slice chicken into strips.","Fry curry paste for 1 min, add coconut milk.","Add chicken, baby corn, and mange tout.","Simmer 15 mins until chicken is cooked through.","Serve over jasmine rice with fresh basil."],
    baseIngredients:[{name:"Chicken Breast",amount:"400g",basePrice:4.50,aisle:"Meat"},{name:"Coconut Milk",amount:"400ml",basePrice:1.20,aisle:"World Foods"},{name:"Green Curry Paste",amount:"2 tbsp",basePrice:0.70,aisle:"World Foods"},{name:"Baby Corn",amount:"100g",basePrice:0.90,aisle:"Produce"},{name:"Mange Tout",amount:"100g",basePrice:1.00,aisle:"Produce"},{name:"Jasmine Rice",amount:"300g",basePrice:1.00,aisle:"Pasta & Rice"}]},
  { id:38,name:"Lamb Kofta with Flatbread",category:"World",health:7,tags:[],
    method:["Mix lamb mince with cumin, salt, pepper, and grated onion.","Shape into oval koftas around skewers.","Grill for 10-12 mins, turning occasionally.","Mix yoghurt with grated cucumber for raita.","Serve in warm flatbreads with red onion and raita."],
    baseIngredients:[{name:"Lamb Mince",amount:"500g",basePrice:5.50,aisle:"Meat"},{name:"Flatbreads",amount:"4 pack",basePrice:1.20,aisle:"Bakery"},{name:"Cucumber",amount:"1",basePrice:0.50,aisle:"Produce"},{name:"Greek Yoghurt",amount:"200g",basePrice:1.00,aisle:"Dairy"},{name:"Red Onion",amount:"1",basePrice:0.30,aisle:"Produce"},{name:"Cumin",amount:"1 tsp",basePrice:0.15,aisle:"Spices"}]},
  { id:39,name:"Dhal with Naan",category:"World",health:8,tags:["vegetarian"],
    method:["Rinse lentils and simmer with turmeric until soft.","Sauté onion and garlic in a separate pan.","Add coconut milk to lentils and stir through.","Mix in the sautéed onion and garlic.","Warm naan breads and serve alongside."],
    baseIngredients:[{name:"Red Lentils",amount:"300g",basePrice:1.20,aisle:"Pulses"},{name:"Coconut Milk",amount:"400ml",basePrice:1.20,aisle:"World Foods"},{name:"Naan Bread",amount:"4 pack",basePrice:1.20,aisle:"Bakery"},{name:"Onion",amount:"1",basePrice:0.25,aisle:"Produce"},{name:"Garlic",amount:"3 cloves",basePrice:0.30,aisle:"Produce"},{name:"Turmeric",amount:"1 tsp",basePrice:0.15,aisle:"Spices"}]},
  { id:40,name:"Korean Bibimbap",category:"World",health:8,tags:["gluten-free"],
    method:["Cook rice and keep warm.","Brown beef mince with gochujang paste.","Sauté spinach and julienne carrots separately.","Fry eggs sunny-side up.","Assemble bowls: rice, veg, beef, topped with a fried egg."],
    baseIngredients:[{name:"Rice",amount:"400g",basePrice:1.00,aisle:"Pasta & Rice"},{name:"Beef Mince",amount:"300g",basePrice:3.50,aisle:"Meat"},{name:"Eggs",amount:"4",basePrice:1.20,aisle:"Dairy"},{name:"Spinach",amount:"200g",basePrice:1.00,aisle:"Produce"},{name:"Carrots",amount:"2",basePrice:0.30,aisle:"Produce"},{name:"Gochujang Paste",amount:"2 tbsp",basePrice:0.80,aisle:"World Foods"}]},
];

const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const CURRENCIES=[{code:"GBP",symbol:"£",name:"British Pound"},{code:"USD",symbol:"$",name:"US Dollar"},{code:"EUR",symbol:"€",name:"Euro"},{code:"AUD",symbol:"A$",name:"Australian Dollar"},{code:"CAD",symbol:"C$",name:"Canadian Dollar"},{code:"JPY",symbol:"¥",name:"Japanese Yen"},{code:"INR",symbol:"₹",name:"Indian Rupee"}];
const POP_SHOPS={GBP:["Tesco","Sainsbury's","Asda","Aldi","Lidl","Morrisons","Waitrose","M&S Food","Co-op","Ocado"],USD:["Walmart","Kroger","Costco","Trader Joe's","Whole Foods","Aldi","Publix","Target","Safeway","Instacart"],EUR:["Lidl","Aldi","Carrefour","Tesco","Spar","Dunnes Stores","SuperValu","Penny","Edeka"],AUD:["Coles","Woolworths","Aldi","IGA","Costco","Harris Farm"],CAD:["Loblaws","No Frills","Walmart","Costco","Metro","Sobeys"],JPY:["Aeon","Seiyu","Ito-Yokado","Life","Costco"],INR:["Big Bazaar","D-Mart","Reliance Fresh","BigBasket","Star Bazaar"]};
// ═══ AFFILIATE CONFIG — Replace "YOUR_ID" with actual affiliate IDs ═══
// Tesco/Sainsbury's/Asda/Ocado/Waitrose: Awin (awin.com)
// Amazon/Whole Foods: Amazon Associates | Walmart/Target: Impact
// Instacart: Tastemakers | Coles/Woolworths: Commission Factory
const AFF={
  "Tesco":{id:"YOUR_TESCO_AWIN_ID",net:"awin"},"Sainsbury's":{id:"YOUR_SAINSBURYS_AWIN_ID",net:"awin"},
  "Asda":{id:"YOUR_ASDA_AWIN_ID",net:"awin"},"Ocado":{id:"YOUR_OCADO_AWIN_ID",net:"awin"},
  "Waitrose":{id:"YOUR_WAITROSE_AWIN_ID",net:"awin"},"Morrisons":{id:"YOUR_MORRISONS_AWIN_ID",net:"awin"},
  "Walmart":{id:"YOUR_WALMART_IMPACT_ID",net:"impact"},"Whole Foods":{id:"YOUR_AMAZON_TAG",net:"amazon"},
  "Instacart":{id:"YOUR_INSTACART_ID",net:"instacart"},"Coles":{id:"YOUR_COLES_CF_ID",net:"cf"},
  "Woolworths":{id:"YOUR_WOOLWORTHS_CF_ID",net:"cf"},"Target":{id:"YOUR_TARGET_IMPACT_ID",net:"impact"},
  "Kroger":{id:"YOUR_KROGER_ID",net:"direct"},"BigBasket":{id:"YOUR_BIGBASKET_ID",net:"direct"},
};
const SHOP_BSEARCH={"Tesco":"https://www.tesco.com/groceries/en-GB/search?query=","Sainsbury's":"https://www.sainsburys.co.uk/gol-ui/SearchResults/","Asda":"https://groceries.asda.com/search/","Ocado":"https://www.ocado.com/search?entry=","Waitrose":"https://www.waitrose.com/ecom/shop/search?&searchTerm=","M&S Food":"https://www.ocado.com/search?entry=","Morrisons":"https://groceries.morrisons.com/search?entry=","Co-op":"https://shop.coop.co.uk/search?query=","Aldi":"https://groceries.aldi.co.uk/en-GB/Search?query=","Lidl":"https://www.lidl.co.uk/q/search?q=","Walmart":"https://www.walmart.com/search?q=","Kroger":"https://www.kroger.com/search?query=","Costco":"https://www.costco.com/CatalogSearch?keyword=","Whole Foods":"https://www.amazon.com/s?k=","Trader Joe's":"https://www.traderjoes.com/home/search?q=","Publix":"https://delivery.publix.com/store/publix/search/","Target":"https://www.target.com/s?searchTerm=","Safeway":"https://www.safeway.com/shop/search-results.html?q=","Instacart":"https://www.instacart.com/store/search/","Coles":"https://www.coles.com.au/search?q=","Woolworths":"https://www.woolworths.com.au/shop/search/products?searchTerm=","BigBasket":"https://www.bigbasket.com/ps/?q=","Carrefour":"https://www.carrefour.com/search?query=","D-Mart":"https://www.dmart.in/searchProduct?keyword="};
const SHOP_BHOME={"Tesco":"https://www.tesco.com/groceries/","Sainsbury's":"https://www.sainsburys.co.uk/gol-ui/groceries/","Asda":"https://groceries.asda.com/","Ocado":"https://www.ocado.com/","Waitrose":"https://www.waitrose.com/ecom/shop/browse/groceries","Morrisons":"https://groceries.morrisons.com/","M&S Food":"https://www.ocado.com/browse/marksandspencer-298703","Co-op":"https://shop.coop.co.uk/","Walmart":"https://www.walmart.com/grocery","Kroger":"https://www.kroger.com/","Costco":"https://www.costco.com/","Whole Foods":"https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo","Instacart":"https://www.instacart.com/","Coles":"https://www.coles.com.au/","Woolworths":"https://www.woolworths.com.au/","BigBasket":"https://www.bigbasket.com/","Carrefour":"https://www.carrefour.com/","Aldi":"https://groceries.aldi.co.uk/"};
function affWrap(shop,url){const a=AFF[shop];if(!a||a.id.startsWith("YOUR_"))return url;const e=encodeURIComponent(url);switch(a.net){case"awin":return`https://www.awin1.com/cread.php?awinmid=${a.id}&awinaffid=${a.id}&ued=${e}`;case"amazon":return url+(url.includes("?")?"&":"?")+`tag=${a.id}`;case"impact":return`https://goto.target.com/c/${a.id}/1/?u=${e}`;case"instacart":return url+(url.includes("?")?"&":"?")+`utm_source=affiliate&utm_medium=${a.id}`;case"cf":return`https://t.cfjump.com/${a.id}/t/${e}`;default:return url+(url.includes("?")?"&":"?")+`ref=${a.id}`;}}
function getSearchUrl(shop,q){const b=SHOP_BSEARCH[shop];return b?affWrap(shop,`${b}${encodeURIComponent(q)}`):null;}
function getHomeUrl(shop){const b=SHOP_BHOME[shop];return b?affWrap(shop,b):null;}
const TIERS={"Waitrose":1.25,"Whole Foods":1.30,"M&S Food":1.20,"Harris Farm":1.15,"Ocado":1.15,"Tesco":1.0,"Sainsbury's":1.05,"Kroger":1.0,"Coles":1.0,"Loblaws":1.05,"Asda":0.92,"Morrisons":0.95,"Walmart":0.88,"No Frills":0.85,"Aldi":0.82,"Lidl":0.83,"Costco":0.80,"D-Mart":0.80,"Trader Joe's":0.95,"Publix":1.05,"Target":0.98,"Safeway":1.02,"Carrefour":0.95,"Spar":1.0,"Dunnes Stores":0.98,"SuperValu":1.0,"Penny":0.82,"Edeka":1.05,"Woolworths":1.0,"IGA":1.08,"Co-op":1.02,"Metro":1.02,"Sobeys":1.05,"Aeon":1.0,"Seiyu":0.92,"Big Bazaar":0.95,"Reliance Fresh":0.92,"BigBasket":0.94,"Instacart":1.08,"Star Bazaar":1.0};
const CMULT={GBP:1,USD:1.27,EUR:1.16,AUD:1.95,CAD:1.72,JPY:190,INR:106};
const gp=(bp,sh,cu)=>Math.round(bp*(TIERS[sh]||1)*(CMULT[cu]||1)*100)/100;
const fmt=(a,sy)=>(sy==="¥"||sy==="₹")?`${sy}${Math.round(a)}`:`${sy}${a.toFixed(2)}`;

function HB({s}){const cl=s>=8?"#22c55e":s>=6?"#eab308":"#ef4444";return (<span style={{display:"inline-flex",alignItems:"center",gap:2,background:cl+"15",color:cl,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,fontFamily:"'JetBrains Mono',monospace"}}>{"♥".repeat(Math.ceil(s/2))} {s}/10</span>);}
function DB({t}){const cl={vegan:"#22c55e",vegetarian:"#10b981","gluten-free":"#f59e0b"};const lb={vegan:"🌱 Vegan",vegetarian:"🥚 Veggie","gluten-free":"🌾 GF"};return (<span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:5,background:(cl[t]||"#666")+"15",color:cl[t]||"#666",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{lb[t]||t}</span>);}

export default function App(){
  const[scr,setScr]=useState("setup");
  const[cur,setCur]=useState(null);
  const[shops,setShops]=useState([]);
  const[cShop,setCShop]=useState("");
  const[fam,setFam]=useState(4);
  const[bud,setBud]=useState("");
  const[plan,setPlan]=useState({});
  const[selDay,setSelDay]=useState(null);
  const[srch,setSrch]=useState("");
  const[fCat,setFCat]=useState("All");
  const[fDiet,setFDiet]=useState([]);
  const[advice,setAdvice]=useState(null);
  const[aiLoad,setAiLoad]=useState(false);
  const[pStat,setPStat]=useState({});
  const[lPrices,setLPrices]=useState({});
  const[showList,setShowList]=useState(false);
  const[checked,setChecked]=useState({});
  const[sortBy,setSortBy]=useState("aisle");
  const[copied,setCopied]=useState(false);
  const[viewRecipe,setViewRecipe]=useState(null);
  const[detectedLoc,setDetectedLoc]=useState(null);
  const[showExport,setShowExport]=useState(false);
  const[showCurDrop,setShowCurDrop]=useState(false);

  // Auto-detect location and currency on first load
  useEffect(()=>{
    const detectFromTimezone=()=>{
      try{
        const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";
        const lang=navigator.language||navigator.userLanguage||"en-GB";
        const region=lang.split("-")[1]||(lang.split("_")[1])||"";
        const tzLower=tz.toLowerCase();
        const tzMap=[
          {match:["europe/london","europe/belfast","gb","uk"],cur:"GBP",loc:"United Kingdom"},
          {match:["america/new_york","america/chicago","america/denver","america/los_angeles","america/anchorage","america/phoenix","us"],cur:"USD",loc:"United States"},
          {match:["europe/paris","europe/berlin","europe/rome","europe/madrid","europe/amsterdam","europe/brussels","europe/vienna","europe/dublin","de","fr","it","es","nl","be","at","ie","pt","fi","gr"],cur:"EUR",loc:"Europe"},
          {match:["australia/sydney","australia/melbourne","australia/brisbane","australia/perth","australia/adelaide","au"],cur:"AUD",loc:"Australia"},
          {match:["america/toronto","america/vancouver","america/winnipeg","america/halifax","ca"],cur:"CAD",loc:"Canada"},
          {match:["asia/tokyo","jp"],cur:"JPY",loc:"Japan"},
          {match:["asia/kolkata","asia/calcutta","in"],cur:"INR",loc:"India"},
        ];
        for(const entry of tzMap){
          if(entry.match.some(m=>tzLower.includes(m)||region.toUpperCase()===m.toUpperCase())){
            const c=CURRENCIES.find(x=>x.code===entry.cur);
            if(c){setCur(c);setDetectedLoc(entry.loc);return true;}
          }
        }
      }catch(e){}
      return false;
    };

    const reverseGeocodeToCurrency=async(lat,lon)=>{
      // Use rough bounding boxes for supported regions (no external API call needed)
      // UK: roughly 49-61N, -8 to 2E
      if(lat>=49&&lat<=61&&lon>=-8&&lon<=2){return{cur:"GBP",loc:"United Kingdom"};}
      // Europe (rough): 35-71N, -10 to 40E (excluding UK which is matched first)
      if(lat>=35&&lat<=71&&lon>=-10&&lon<=40){return{cur:"EUR",loc:"Europe"};}
      // US mainland: 24-49N, -125 to -66W
      if(lat>=24&&lat<=49&&lon>=-125&&lon<=-66){return{cur:"USD",loc:"United States"};}
      // Canada: 42-83N, -141 to -52W
      if(lat>=42&&lat<=83&&lon>=-141&&lon<=-52){return{cur:"CAD",loc:"Canada"};}
      // Australia: -44 to -10S, 113-154E
      if(lat>=-44&&lat<=-10&&lon>=113&&lon<=154){return{cur:"AUD",loc:"Australia"};}
      // Japan: 24-46N, 123-146E
      if(lat>=24&&lat<=46&&lon>=123&&lon<=146){return{cur:"JPY",loc:"Japan"};}
      // India: 6-36N, 68-97E
      if(lat>=6&&lat<=36&&lon>=68&&lon<=97){return{cur:"INR",loc:"India"};}
      return null;
    };

    const detect=async()=>{
      // First try loading saved preference
      const saved=await storage.get("trollii-cur");
      if(saved){
        const c=CURRENCIES.find(x=>x.code===saved);
        if(c){setCur(c);setDetectedLoc("Saved preference");return;}
      }
      // On native, try geolocation (with permission)
      if(isNative){
        try{
          const perm=await Geolocation.checkPermissions();
          if(perm.location==="granted"||perm.location==="prompt"){
            const pos=await Geolocation.getCurrentPosition({timeout:5000,enableHighAccuracy:false});
            const match=await reverseGeocodeToCurrency(pos.coords.latitude,pos.coords.longitude);
            if(match){
              const c=CURRENCIES.find(x=>x.code===match.cur);
              if(c){setCur(c);setDetectedLoc(match.loc);return;}
            }
          }
        }catch(e){}
      }
      // Fallback to timezone detection
      if(!detectFromTimezone()){
        setCur(CURRENCIES[0]);
        setDetectedLoc(null);
      }
    };
    detect();
  },[]);

  // Persist currency preference whenever it changes
  useEffect(()=>{
    if(cur)storage.set("trollii-cur",cur.code);
  },[cur]);

  // Persist plan and shops
  useEffect(()=>{storage.set("trollii-plan",plan);},[plan]);
  useEffect(()=>{storage.set("trollii-shops",shops);},[shops]);
  useEffect(()=>{storage.set("trollii-fam",fam);},[fam]);
  useEffect(()=>{storage.set("trollii-bud",bud);},[bud]);

  // Load saved state on first mount
  useEffect(()=>{
    (async()=>{
      const p=await storage.get("trollii-plan");if(p)setPlan(p);
      const s=await storage.get("trollii-shops");if(s&&s.length)setShops(s);
      const f=await storage.get("trollii-fam");if(f)setFam(f);
      const b=await storage.get("trollii-bud");if(b)setBud(b);
    })();
  },[]);

  const ps=shops[0]||"Aldi";const sc=fam/2;
  const curCode=cur?cur.code:"GBP";const curSym=cur?cur.symbol:"£";const curName=cur?cur.name:"British Pound";
  const searchUrl=SHOP_BSEARCH[ps];const homeUrl=getHomeUrl(ps);

  const meals=useMemo(()=>Object.entries(plan).map(([day,id])=>{
    const m=MEALS_DB.find(x=>x.id===id);if(!m)return null;
    const ings=m.baseIngredients.map(ig=>{const k=`${ps}-${ig.name}`;const lp=lPrices[k];return{...ig,sp:lp!=null?lp*sc:gp(ig.basePrice,ps,curCode)*sc};});
    return{day,meal:m,ingredients:ings,total:ings.reduce((s,ig)=>s+ig.sp,0)};
  }).filter(Boolean),[plan,fam,ps,curCode,lPrices]);

  const wt=meals.reduce((s,m)=>s+m.total,0);const bn=parseFloat(bud)||0;const ob=bn>0&&wt>bn;

  const sList=useMemo(()=>{
    const map={};meals.forEach(m=>m.ingredients.forEach(ig=>{
      if(map[ig.name]){map[ig.name].tp+=ig.sp;map[ig.name].ms.push(m.day);}
      else map[ig.name]={name:ig.name,amount:ig.amount,tp:ig.sp,aisle:ig.aisle||"Other",ms:[m.day]};
    }));
    let items=Object.values(map);
    if(sortBy==="aisle")items.sort((a,b)=>a.aisle.localeCompare(b.aisle)||a.name.localeCompare(b.name));
    else items.sort((a,b)=>a.name.localeCompare(b.name));
    return items;
  },[meals,sortBy]);

  const cc=Object.values(checked).filter(Boolean).length;

  const buildListText=(includePrice,includeChecks)=>{
    const aisles=[...new Set(sList.map(ig=>ig.aisle))];
    let lines=[];
    if(sortBy==="aisle"){
      aisles.forEach(aisle=>{
        lines.push(`\n📍 ${aisle.toUpperCase()}`);
        sList.filter(ig=>ig.aisle===aisle).forEach(ig=>{
          const chk=includeChecks?(checked[ig.name]?"✓":"☐")+" ":"• ";
          const price=includePrice?` — ${fmt(ig.tp,curSym)}`:"";
          lines.push(`${chk}${ig.name} (${ig.amount})${price}`);
        });
      });
    } else {
      sList.forEach(ig=>{
        const chk=includeChecks?(checked[ig.name]?"✓":"☐")+" ":"• ";
        const price=includePrice?` — ${fmt(ig.tp,curSym)}`:"";
        lines.push(`${chk}${ig.name} (${ig.amount})${price}`);
      });
    }
    const stot=sList.reduce((s,ig)=>s+ig.tp,0);
    const header=`🛒 TROLLII — ${ps}\n👨‍👩‍👧‍👦 Family of ${fam} · ${Object.keys(plan).length} meals`;
    const footer=includePrice?`\n💰 Total: ${fmt(stot,curSym)}`+(bn>0?` (Budget: ${fmt(bn,curSym)})`:""):"";
    return `${header}\n${"─".repeat(28)}${lines.join("\n")}\n${"─".repeat(28)}${footer}\n\nPlanned with Trollii`;
  };

  const copyList=async()=>{
    const ok=await copyToClipboard(buildListText(true,true));
    if(ok){setCopied(true);setTimeout(()=>setCopied(false),2000);}
  };

  const shareNative=async()=>{
    await shareText(`Shopping List — ${ps}`,buildListText(true,false));
  };

  const shareWhatsApp=async()=>{
    const text=buildListText(false,false);
    await openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const shareEmail=async()=>{
    const text=buildListText(true,false);
    const subj=encodeURIComponent(`Shopping List — ${ps} — Trollii`);
    // mailto: links work natively without Browser plugin
    if(isNative){
      window.location.href=`mailto:?subject=${subj}&body=${encodeURIComponent(text)}`;
    }else{
      window.open(`mailto:?subject=${subj}&body=${encodeURIComponent(text)}`,"_blank");
    }
  };

  const shareSMS=()=>{
    const text=buildListText(false,false);
    window.location.href=`sms:?body=${encodeURIComponent(text)}`;
  };

  const downloadList=async()=>{
    const text=buildListText(true,true);
    const filename=`shopping-list-${ps.toLowerCase().replace(/[^a-z0-9]/g,"-")}.txt`;
    await saveFile(filename,text,"text/plain");
  };

  const downloadCSV=async()=>{
    const rows=[["Item","Amount","Aisle","Price","Checked"]];
    sList.forEach(ig=>rows.push([ig.name,ig.amount,ig.aisle,ig.tp.toFixed(2),checked[ig.name]?"Yes":"No"]));
    rows.push([]);rows.push(["Total","","",sList.reduce((s,ig)=>s+ig.tp,0).toFixed(2),""]);
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const filename=`shopping-list-${ps.toLowerCase().replace(/[^a-z0-9]/g,"-")}.csv`;
    await saveFile(filename,csv,"text/csv");
  };

  const fetchPrices=useCallback(async()=>{
    if(!meals.length)return;const all=[...new Set(meals.flatMap(m=>m.ingredients.map(ig=>ig.name)))];
    for(const ing of all){const k=`${ps}-${ing}`;if(pStat[k]==="loaded"||pStat[k]==="loading")continue;
      setPStat(p=>({...p,[k]:"loading"}));
      try{
        const r=await fetch(`${API_BASE}/api/anthropic`,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({type:"price",ingredient:ing,shop:ps,currencyName:curName,currencyCode:curCode}),
        });
        const d=await r.json();
        if(d.price)setLPrices(v=>({...v,[k]:d.price}));
        setPStat(p=>({...p,[k]:"loaded"}));
      }catch(e){setPStat(p=>({...p,[k]:"error"}));}}
  },[meals,ps,cur,pStat]);

  const getAdvice=useCallback(async()=>{
    setAiLoad(true);const ms=meals.map(m=>`${m.day}: ${m.meal.name} (${fmt(m.total,curSym)})`).join("\n");
    try{
      const r=await fetch(`${API_BASE}/api/anthropic`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          type:"advice",
          family:fam,budget:bn,budgetFmt:fmt(bn,curSym),currencyCode:curCode,
          shop:ps,totalFmt:fmt(wt,curSym),overBudget:ob,overFmt:ob?fmt(wt-bn,curSym):null,
          mealSummary:ms,
        }),
      });
      const d=await r.json();
      if(d.tips)setAdvice(d.tips);
      else throw new Error("No tips");
    }catch(e){
      setAdvice([{tip:"Try plant-based proteins like lentils or chickpeas instead of meat — healthier and significantly cheaper.",saving:fmt(bn*0.1,curSym)}]);
    }
    setAiLoad(false);
  },[meals,fam,bn,cur,ps,wt,ob]);

  const cats=["All",...new Set(MEALS_DB.map(m=>m.category))];
  const filtered=MEALS_DB.filter(m=>{const mc=fCat==="All"||m.category===fCat;const ms=m.name.toLowerCase().includes(srch.toLowerCase());const md=fDiet.length===0||fDiet.every(d=>d==="vegetarian"?m.tags.includes("vegetarian")||m.tags.includes("vegan"):m.tags.includes(d));return mc&&ms&&md;});
  const tShop=sh=>setShops(p=>p.includes(sh)?p.filter(x=>x!==sh):[...p,sh]);
  const addShop=()=>{if(cShop.trim()&&!shops.includes(cShop.trim())){setShops(p=>[...p,cShop.trim()]);setCShop("");}};
  const tDiet=tg=>setFDiet(p=>p.includes(tg)?p.filter(x=>x!==tg):[...p,tg]);

  // ═══ DESIGN ═══
  const bg="#070a05",cd="#111610",cdh="#181e14",ac="#b5e853",acd="#5d8c1a",tp="#e8f2dd",ts="#6b7a60",dn="#f87171",sf="#1a2016";
  const bb={border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600,borderRadius:10,transition:"all 0.15s"};
  const pb={...bb,background:ac,color:"#070a05",padding:"13px 24px",fontSize:14};
  const gb={...bb,background:"transparent",color:ts,border:`1px solid ${sf}`,padding:"9px 16px",fontSize:12};
  const inp={background:sf,border:"1px solid #262e20",borderRadius:10,padding:"11px 14px",color:tp,fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",width:"100%",boxSizing:"border-box"};
  const wrap={minHeight:"100vh",background:bg,color:tp,fontFamily:"'DM Sans',sans-serif",paddingBottom:60};
  const hdr={padding:"24px 18px 18px",textAlign:"center",borderBottom:`1px solid ${sf}`};
  const cnt={maxWidth:580,margin:"0 auto",padding:"18px 14px"};
  const fonts=<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Fraunces:wght@700;800;900&display=swap" rel="stylesheet"/>;

  // ══════ RECIPE VIEW ══════
  if(viewRecipe){
    const meal=MEALS_DB.find(m=>m.id===viewRecipe);
    if(!meal) {setViewRecipe(null); return null;}
    const cost=meal.baseIngredients.reduce((s,ig)=>s+gp(ig.basePrice,ps,curCode),0)*sc;
    return(
      <div style={wrap}>{fonts}
        <div style={{padding:"14px 14px 10px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${sf}`}}>
          <button onClick={()=>setViewRecipe(null)} style={{...gb,padding:"6px 10px",fontSize:12}}>← Back</button>
        </div>
        <div style={cnt}>
          <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,margin:"0 0 8px",lineHeight:1.2}}>{meal.name}</h2>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:10,color:ts,fontFamily:"'JetBrains Mono',monospace"}}>{meal.category}</span>
            <HB s={meal.health}/>{meal.tags.map(tg=><DB key={tg} t={tg}/>)}
          </div>
          <div style={{fontSize:14,color:ac,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,marginBottom:20}}>{fmt(cost,curSym)} <span style={{fontSize:11,color:ts,fontWeight:400}}>for {fam} people</span></div>

          <div style={{fontSize:11,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}>INGREDIENTS</div>
          <div style={{background:cd,borderRadius:12,padding:"14px 16px",marginBottom:24,border:`1px solid ${sf}`}}>
            {meal.baseIngredients.map((ig,idx)=>(
              <div key={ig.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:idx<meal.baseIngredients.length-1?`1px solid ${sf}`:"none"}}>
                <div><div style={{fontSize:14,fontWeight:500}}>{ig.name}</div><div style={{fontSize:11,color:ts}}>{ig.amount} · {ig.aisle}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:ac}}>{fmt(gp(ig.basePrice,ps,curCode)*sc,curSym)}</span>
                  {searchUrl&&<button onClick={e=>{e.stopPropagation();openExternal(getSearchUrl(ps,ig.name));}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:acd+"25",color:ac,fontSize:12,border:"none",cursor:"pointer",fontWeight:700}}>↗</button>}
                </div>
              </div>
            ))}
          </div>

          <div style={{fontSize:11,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}>METHOD</div>
          <div style={{background:cd,borderRadius:12,padding:"16px 18px",border:`1px solid ${sf}`}}>
            {(meal.method||[]).map((step,idx)=>(
              <div key={idx} style={{display:"flex",gap:12,marginBottom:idx<(meal.method||[]).length-1?14:0}}>
                <div style={{width:26,height:26,borderRadius:99,background:acd+"30",color:ac,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{idx+1}</div>
                <div style={{fontSize:14,lineHeight:1.6,color:tp,paddingTop:2}}>{step}</div>
              </div>
            ))}
          </div>

          <div style={{display:"flex",gap:8,marginTop:20}}>
            {selDay&&<button onClick={()=>{setPlan(p=>({...p,[selDay]:meal.id}));setViewRecipe(null);setSelDay(null);setSrch("");setFCat("All");setFDiet([]);}} style={{...pb,flex:1,fontSize:13,padding:"12px"}}>Add to {selDay}</button>}
            {!selDay&&Object.keys(plan).length<7&&<button onClick={()=>{const free=DAYS.find(d=>!plan[d]);if(free)setPlan(p=>({...p,[free]:meal.id}));setViewRecipe(null);}} style={{...pb,flex:1,fontSize:13,padding:"12px"}}>Add to Plan</button>}
          </div>
        </div>
      </div>
    );
  }

  // ══════ SETUP ══════
  if(scr==="setup")return(
    <div style={wrap}>{fonts}
      <div style={hdr}><div style={{fontSize:10,letterSpacing:4,color:acd,fontFamily:"'JetBrains Mono',monospace",fontWeight:500,marginBottom:5}}>SMART MEAL PLANNING</div><h1 style={{fontFamily:"'Fraunces',serif",fontSize:40,fontWeight:900,margin:0,lineHeight:1.05}}>troll<span style={{color:ac}}>ii</span></h1><p style={{color:ts,fontSize:12,marginTop:6}}>Plan meals · Track budget · Shop smarter</p></div>
      <div style={cnt}>
        <div style={{marginBottom:24}}>
          <label style={{fontSize:10,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",display:"block",marginBottom:8}}>CURRENCY</label>
          {detectedLoc&&!showCurDrop&&<div style={{fontSize:11,color:acd,marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>📍 Detected: {detectedLoc}</div>}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div onClick={()=>setShowCurDrop(!showCurDrop)} style={{flex:1,background:sf,border:`1px solid ${showCurDrop?ac:"#262e20"}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:15,fontWeight:600}}>{cur?`${curSym} ${curCode}`:"Detecting…"} <span style={{fontSize:12,fontWeight:400,color:ts}}>{cur?curName:""}</span></span>
              <span style={{color:ts,fontSize:12}}>{showCurDrop?"▲":"▼"}</span>
            </div>
          </div>
          {showCurDrop&&<div style={{background:cd,border:`1px solid ${sf}`,borderRadius:10,marginTop:6,overflow:"hidden"}}>
            {CURRENCIES.map(cr=>(
              <div key={cr.code} onClick={()=>{setCur(cr);setShops([]);setShowCurDrop(false);}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:cur&&curCode===cr.code?ac+"12":"transparent",borderBottom:`1px solid ${sf}`}}>
                <span style={{fontSize:14,fontWeight:cur&&curCode===cr.code?600:400}}>{cr.symbol} {cr.code} <span style={{fontSize:12,color:ts}}>{cr.name}</span></span>
                {cur&&curCode===cr.code&&<span style={{color:ac,fontSize:12,fontWeight:700}}>✓</span>}
              </div>
            ))}
          </div>}
        </div>
        <div style={{marginBottom:24}}><label style={{fontSize:10,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",display:"block",marginBottom:4}}>YOUR SHOPS <span style={{color:ac,fontSize:8}}>first = primary</span></label><div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>{(POP_SHOPS[curCode]||[]).map(sh=><button key={sh} onClick={()=>tShop(sh)} style={{...gb,fontSize:11,padding:"6px 11px",...(shops.includes(sh)?{background:ac+"18",borderColor:ac,color:ac}:{})}}>{shops.indexOf(sh)===0?"★ ":""}{sh}</button>)}</div><div style={{display:"flex",gap:6,marginTop:8}}><input value={cShop} onChange={e=>setCShop(e.target.value)} placeholder="Custom shop…" style={{...inp,flex:1,fontSize:13}} onKeyDown={e=>e.key==="Enter"&&addShop()}/><button onClick={addShop} style={{...gb,color:ac,borderColor:acd,padding:"9px 14px"}}>+</button></div></div>
        <div style={{marginBottom:24}}><label style={{fontSize:10,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",display:"block",marginBottom:8}}>FAMILY SIZE</label><div style={{display:"flex",alignItems:"center",gap:12}}><button onClick={()=>setFam(Math.max(1,fam-1))} style={{...gb,width:40,height:40,fontSize:18,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button><span style={{fontSize:34,fontFamily:"'Fraunces',serif",fontWeight:800,minWidth:40,textAlign:"center"}}>{fam}</span><button onClick={()=>setFam(fam+1)} style={{...gb,width:40,height:40,fontSize:18,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button><span style={{color:ts,fontSize:12}}>people</span></div></div>
        <div style={{marginBottom:32}}><label style={{fontSize:10,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",display:"block",marginBottom:8}}>WEEKLY BUDGET</label><div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:ac,fontSize:17,fontWeight:700}}>{curSym}</span><input value={bud} onChange={e=>setBud(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0.00" inputMode="decimal" style={{...inp,paddingLeft:34,fontSize:20,fontFamily:"'JetBrains Mono',monospace",fontWeight:500}}/></div></div>
        <button onClick={()=>shops.length&&setScr("plan")} disabled={!shops.length} style={{...pb,width:"100%",opacity:shops.length?1:0.4,fontSize:15,padding:"15px"}}>Start Planning →</button>
        {!shops.length&&<p style={{color:ts,fontSize:10,textAlign:"center",marginTop:6}}>Select at least one shop</p>}
      </div>
    </div>
  );

  // ══════ MEAL SELECT ══════
  if(selDay)return(
    <div style={wrap}>{fonts}
      <div style={{padding:"14px 14px 10px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${sf}`}}><button onClick={()=>{setSelDay(null);setSrch("");setFCat("All");setFDiet([]);}} style={{...gb,padding:"6px 10px",fontSize:12}}>← Back</button><div><div style={{fontSize:9,color:ts,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5}}>MEAL FOR</div><div style={{fontSize:16,fontFamily:"'Fraunces',serif",fontWeight:800}}>{selDay}</div></div></div>
      <div style={cnt}>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Search 40 meals…" style={{...inp,marginBottom:8,fontSize:13}}/>
        <div style={{display:"flex",gap:5,marginBottom:6}}>{["vegan","vegetarian","gluten-free"].map(tg=><button key={tg} onClick={()=>tDiet(tg)} style={{...gb,fontSize:10,padding:"4px 9px",...(fDiet.includes(tg)?{background:(tg==="gluten-free"?"#f59e0b":"#22c55e")+"18",borderColor:tg==="gluten-free"?"#f59e0b":"#22c55e",color:tg==="gluten-free"?"#f59e0b":"#22c55e"}:{})}}>{tg==="vegan"?"🌱 Vegan":tg==="vegetarian"?"🥚 Veggie":"🌾 GF"}</button>)}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{cats.map(ct=><button key={ct} onClick={()=>setFCat(ct)} style={{...gb,fontSize:10,padding:"4px 10px",...(fCat===ct?{background:ac+"18",borderColor:ac,color:ac}:{})}}>{ct}</button>)}</div>
        <div style={{fontSize:10,color:ts,marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}>{filtered.length} meals</div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {filtered.map(meal=>{const cost=meal.baseIngredients.reduce((s,ig)=>s+gp(ig.basePrice,ps,curCode),0)*sc;
            return(
              <div key={meal.id} style={{background:cd,border:`1px solid ${sf}`,borderRadius:11,padding:"12px 14px",cursor:"pointer",transition:"all 0.15s"}} onClick={()=>{setPlan(p=>({...p,[selDay]:meal.id}));setSelDay(null);setSrch("");setFCat("All");setFDiet([]);}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,marginBottom:4,color:tp,lineHeight:1.3}}>{meal.name}</div><div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:9,color:ts,fontFamily:"'JetBrains Mono',monospace"}}>{meal.category}</span><HB s={meal.health}/>{meal.tags.map(tg=><DB key={tg} t={tg}/>)}</div></div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                    <div style={{fontSize:15,fontWeight:700,color:ac,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(cost,curSym)}</div>
                    <div style={{display:"flex",gap:4,marginTop:4,justifyContent:"flex-end"}}>
                      <button onClick={e=>{e.stopPropagation();setViewRecipe(meal.id);}} style={{...gb,fontSize:9,padding:"2px 8px",color:ac,borderColor:acd}}>View Recipe</button>
                    </div>
                  </div>
                </div>
              </div>
            );})}
          {!filtered.length&&<div style={{textAlign:"center",padding:36,color:ts}}>No meals match filters</div>}
        </div>
      </div>
    </div>
  );

  // ══════ SHOPPING LIST ══════
  if(showList){
    const aisles=[...new Set(sList.map(ig=>ig.aisle))];const stot=sList.reduce((s,ig)=>s+ig.tp,0);
    const unchecked=sList.filter(ig=>!checked[ig.name]);
    const renderItem=(item)=>{
      const ch=!!checked[item.name];const sLink=searchUrl?getSearchUrl(ps,item.name):null;
      return(
        <div key={item.name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:ch?sf:cd,borderRadius:9,marginBottom:3,border:`1px solid ${ch?acd+"30":"transparent"}`,transition:"all 0.15s",opacity:ch?0.5:1}}>
          <div onClick={()=>setChecked(p=>({...p,[item.name]:!p[item.name]}))} style={{width:22,height:22,borderRadius:6,border:`2px solid ${ch?ac:ts}`,background:ch?ac:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{ch&&<span style={{color:"#070a05",fontSize:12,fontWeight:800}}>✓</span>}</div>
          <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setChecked(p=>({...p,[item.name]:!p[item.name]}))}>
            <div style={{fontSize:13,fontWeight:500,textDecoration:ch?"line-through":"none"}}>{item.name}</div>
            <div style={{fontSize:10,color:ts}}>{item.amount} · {item.ms.length>1?`${item.ms.length} meals`:item.ms[0]}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:ch?ts:ac}}>{fmt(item.tp,curSym)}</span>
            {sLink&&!ch&&<button onClick={e=>{e.stopPropagation();openExternal(sLink);}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:7,background:acd+"25",color:ac,fontSize:13,border:"none",cursor:"pointer",fontWeight:700,flexShrink:0}} title={`Search at ${ps}`}>↗</button>}
          </div>
        </div>
      );
    };
    return(
      <div style={wrap}>{fonts}
        <div style={{padding:"14px 14px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${sf}`}}>
          <button onClick={()=>setShowList(false)} style={{...gb,padding:"6px 10px",fontSize:12}}>← Menu</button>
          <div style={{textAlign:"center"}}><div style={{fontSize:9,color:ts,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5}}>SHOPPING LIST</div><div style={{fontSize:15,fontFamily:"'Fraunces',serif",fontWeight:800}}>{ps}</div></div>
          <div style={{fontSize:11,color:ac,fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{cc}/{sList.length}</div>
        </div>
        <div style={cnt}>
          <div style={{background:cd,borderRadius:12,padding:"12px 16px",marginBottom:12,border:`1px solid ${sf}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:ts,fontFamily:"'JetBrains Mono',monospace"}}>PROGRESS</span><span style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:ac}}>{sList.length?Math.round(cc/sList.length*100):0}%</span></div>
            <div style={{background:sf,borderRadius:99,height:5,overflow:"hidden"}}><div style={{width:`${sList.length?cc/sList.length*100:0}%`,height:"100%",borderRadius:99,background:`linear-gradient(90deg,${acd},${ac})`,transition:"width 0.3s"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><span style={{fontSize:11,color:ts}}>Total: {fmt(stot,curSym)}</span>{cc>0&&<button onClick={()=>setChecked({})} style={{...bb,background:"none",fontSize:10,color:ts,padding:0,textDecoration:"underline"}}>Clear all</button>}</div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <button onClick={copyList} style={{...gb,flex:1,fontSize:11,color:copied?ac:ts,borderColor:copied?ac:sf}}>{copied?"✓ Copied!":"📋 Copy"}</button>
            <button onClick={()=>setShowExport(!showExport)} style={{...gb,flex:1,fontSize:11,color:showExport?ac:ts,borderColor:showExport?ac:sf}}>📤 Share & Export</button>
            {[["aisle","By Aisle"],["alpha","A-Z"]].map(([v,l])=><button key={v} onClick={()=>setSortBy(v)} style={{...gb,fontSize:10,padding:"4px 9px",flex:0,...(sortBy===v?{background:ac+"18",borderColor:ac,color:ac}:{})}}>{l}</button>)}
          </div>
          {showExport&&(
            <div style={{background:cd,borderRadius:11,padding:"14px 16px",marginBottom:12,border:`1px solid ${acd}30`}}>
              <div style={{fontSize:10,letterSpacing:2,color:acd,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,marginBottom:10}}>SHARE WITH</div>
              <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                <button onClick={shareWhatsApp} style={{...gb,flex:1,fontSize:11,minWidth:80,padding:"10px 8px",color:"#25D366",borderColor:"#25D366"+"40"}}>💬 WhatsApp</button>
                <button onClick={shareEmail} style={{...gb,flex:1,fontSize:11,minWidth:80,padding:"10px 8px"}}>✉️ Email</button>
                <button onClick={shareSMS} style={{...gb,flex:1,fontSize:11,minWidth:80,padding:"10px 8px"}}>💬 Text</button>
                <button onClick={shareNative} style={{...gb,flex:1,fontSize:11,minWidth:80,padding:"10px 8px",color:ac,borderColor:acd}}>📱 More…</button>
              </div>
              <div style={{fontSize:10,letterSpacing:2,color:acd,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,marginBottom:10}}>EXPORT AS FILE</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={downloadList} style={{...gb,flex:1,fontSize:11,padding:"10px 8px"}}>📄 .txt</button>
                <button onClick={downloadCSV} style={{...gb,flex:1,fontSize:11,padding:"10px 8px"}}>📊 .csv</button>
              </div>
            </div>
          )}
          {searchUrl&&unchecked.length>0&&(
            <div style={{background:cd,borderRadius:11,padding:"14px 16px",marginBottom:14,border:`1px solid ${acd}30`}}>
              <div style={{fontSize:11,fontWeight:600,color:ac,marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}>⚡ QUICK ORDER</div>
              <p style={{fontSize:12,color:ts,margin:"0 0 10px",lineHeight:1.5}}>Tap ↗ on each item to search & add at {ps}, or open the store:</p>
              <div style={{display:"flex",gap:6}}>
                {homeUrl&&<button onClick={()=>openExternal(homeUrl)} style={{...pb,flex:1,fontSize:12,padding:"10px 12px",textAlign:"center",borderRadius:10,border:"none"}}>Open {ps} →</button>}
              </div>
            </div>
          )}
          {sortBy==="aisle"?aisles.map(aisle=>{
            const items=sList.filter(ig=>ig.aisle===aisle);
            return(<div key={aisle} style={{marginBottom:14}}>
              <div style={{fontSize:10,letterSpacing:2,color:acd,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,marginBottom:6,padding:"5px 10px",background:sf,borderRadius:7}}>{aisle.toUpperCase()}</div>
              {items.map(renderItem)}
            </div>);
          }):sList.map(renderItem)}
          {!sList.length&&<div style={{textAlign:"center",padding:36,color:ts}}>Add meals to your plan first</div>}
        </div>
      </div>
    );
  }

  // ══════ PLAN ══════
  return(
    <div style={wrap}>{fonts}
      <div style={hdr}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><button onClick={()=>setScr("setup")} style={{...gb,fontSize:10,padding:"4px 9px"}}>⚙ Setup</button><div style={{textAlign:"center"}}><h2 style={{fontFamily:"'Fraunces',serif",fontSize:19,margin:0,fontWeight:800}}>Your <span style={{color:ac}}>Week</span></h2><div style={{fontSize:9,color:ts,fontFamily:"'JetBrains Mono',monospace",marginTop:1}}>{fam} people · {ps}</div></div><button onClick={()=>meals.length&&setShowList(true)} disabled={!meals.length} style={{...gb,fontSize:10,padding:"4px 9px",color:meals.length?ac:ts,borderColor:meals.length?acd:sf}}>🛒 List</button></div></div>
      <div style={cnt}>
        {bn>0&&<div style={{background:cd,borderRadius:12,padding:"14px 16px",marginBottom:16,border:`1px solid ${ob?dn+"35":sf}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:ts,fontFamily:"'JetBrains Mono',monospace"}}>BUDGET</span><span style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:ob?dn:ac}}>{fmt(wt,curSym)} / {fmt(bn,curSym)}</span></div>
          <div style={{background:sf,borderRadius:99,height:6,overflow:"hidden"}}><div style={{width:`${Math.min(wt/bn*100,100)}%`,height:"100%",borderRadius:99,transition:"width 0.4s",background:ob?dn:`linear-gradient(90deg,${acd},${ac})`}}/></div>
          {ob&&<div style={{fontSize:11,color:dn,marginTop:6,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>⚠ {fmt(wt-bn,curSym)} over<button onClick={getAdvice} disabled={aiLoad} style={{...gb,fontSize:9,padding:"2px 7px",borderColor:dn+"40",color:dn,marginLeft:"auto"}}>{aiLoad?"…":"AI Tips"}</button></div>}
        </div>}
        {advice&&<div style={{background:acd+"10",border:`1px solid ${acd}25`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:10,letterSpacing:2,fontFamily:"'JetBrains Mono',monospace",color:ac}}>✦ AI TIPS</span><button onClick={()=>setAdvice(null)} style={{...bb,background:"none",fontSize:10,color:ts,padding:"2px 5px"}}>✕</button></div>
          {advice.map((a,idx)=><div key={idx} style={{marginBottom:idx<advice.length-1?8:0,paddingBottom:idx<advice.length-1?8:0,borderBottom:idx<advice.length-1?`1px solid ${sf}`:"none"}}><div style={{fontSize:12,color:tp,lineHeight:1.5}}>{a.tip}</div>{a.saving&&<div style={{fontSize:10,color:ac,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>Save: {a.saving}</div>}</div>)}
        </div>}
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
          {DAYS.map(day=>{const md=meals.find(m=>m.day===day);const ml=md?.meal;
            return(<div key={day} onClick={()=>setSelDay(day)} style={{background:cd,borderRadius:11,padding:"12px 14px",border:`1px solid ${md?sf:"#262e20"}`,cursor:"pointer",borderStyle:md?"solid":"dashed",transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:9,color:ts,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5,marginBottom:2}}>{day.toUpperCase()}</div>{ml?<><div style={{fontSize:13,fontWeight:600,marginBottom:4,color:tp,lineHeight:1.3}}>{ml.name}</div><div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}><HB s={ml.health}/>{ml.tags.map(tg=><DB key={tg} t={tg}/>)}</div></>:<div style={{fontSize:12,color:ts,fontStyle:"italic"}}>Tap to add meal</div>}</div>
              {md?<div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                <div style={{fontSize:15,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:ac}}>{fmt(md.total,curSym)}</div>
                <div style={{display:"flex",gap:4,marginTop:3,justifyContent:"flex-end"}}>
                  <button onClick={e=>{e.stopPropagation();setViewRecipe(ml.id);}} style={{...bb,background:"none",fontSize:9,padding:"1px 6px",color:ac,border:`1px solid ${acd}`,borderRadius:5}}>Recipe</button>
                  <button onClick={e=>{e.stopPropagation();setPlan(p=>{const n={...p};delete n[day];return n;});}} style={{...bb,background:"none",fontSize:9,padding:"1px 5px",color:dn}}>✕</button>
                </div>
              </div>:<div style={{fontSize:20,color:ts}}>+</div>}</div>
            </div>);})}
        </div>
        {meals.length>0&&<div style={{background:cd,borderRadius:12,padding:"16px",marginBottom:14,border:`1px solid ${sf}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:12,fontWeight:600}}>Weekly Total</span><span style={{fontSize:24,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:ob?dn:ac}}>{fmt(wt,curSym)}</span></div>
          <div style={{display:"flex",gap:7,marginBottom:8}}><button onClick={()=>setShowList(true)} style={{...pb,flex:1,fontSize:12,padding:"11px 12px"}}>🛒 Shopping List</button><button onClick={getAdvice} disabled={aiLoad} style={{...gb,flex:1,color:ac,borderColor:acd}}>{aiLoad?"…":"✦ AI Advice"}</button></div>
          <div style={{display:"flex",gap:7}}><button onClick={fetchPrices} style={{...gb,flex:1,fontSize:11}}>↻ Live Prices</button>{homeUrl&&<button onClick={()=>openExternal(homeUrl)} style={{...gb,flex:1,fontSize:11,textAlign:"center",color:ac,borderColor:acd,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>Order Online →</button>}</div>
        </div>}
        {meals.length>0&&shops.length>1&&<div style={{background:cd,borderRadius:12,padding:"14px 16px",border:`1px solid ${sf}`}}>
          <div style={{fontSize:10,letterSpacing:2,color:ts,fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}>SHOP COMPARISON</div>
          {shops.map(shop=>{const st=Object.values(plan).reduce((s,id)=>{const m=MEALS_DB.find(x=>x.id===id);return m?s+m.baseIngredients.reduce((ss,ig)=>ss+gp(ig.basePrice,shop,curCode),0)*sc:s;},0);const allT=shops.map(sh2=>Object.values(plan).reduce((sum,id)=>{const m=MEALS_DB.find(x=>x.id===id);return m?sum+m.baseIngredients.reduce((ss,ig)=>ss+gp(ig.basePrice,sh2,curCode),0)*sc:sum;},0));const cheap=st===Math.min(...allT);
            return(<div key={shop} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${sf}`}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:12,fontWeight:shop===ps?600:400}}>{shop}</span>{shop===ps&&<span style={{fontSize:7,background:ac+"18",color:ac,padding:"1px 4px",borderRadius:3,fontFamily:"'JetBrains Mono',monospace"}}>PRIMARY</span>}{cheap&&<span style={{fontSize:7,background:"#22c55e18",color:"#22c55e",padding:"1px 4px",borderRadius:3,fontFamily:"'JetBrains Mono',monospace"}}>CHEAPEST</span>}</div><span style={{fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:cheap?"#22c55e":tp}}>{fmt(st,curSym)}</span></div>);})}
        </div>}
      </div>
    </div>
  );
}
