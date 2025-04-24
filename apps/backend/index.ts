import { fal } from "@fal-ai/client";
import express from "express";
import { TrainModel, GenerateImage, GenerateImagesFromPack } from "common/types";
import { prismaClient } from "db";
import { S3Client } from "bun";
import { FalAIModel } from "./models/FalAIModel";
import cors from "cors";
import { authMiddleware } from "./middleware";


fal.config({
  credentials: process.env.PHOTO_API_KEY
});

console.log(process.env.PHOTO_API_KEY)

const PORT = process.env.PORT || 8080;

const falAiModel = new FalAIModel();

const app = express();
app.use(cors({
  origin: '*',
}));
app.use(express.json(

));

app.get("/pre-signed-url", async (req, res) => {
  const key = `models/${Date.now()}_${Math.random()}.zip`;
  const url = S3Client.presign(key, {
    method: "PUT",
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.ENDPOINT,
    bucket: process.env.BUCKET_NAME,
    expiresIn: 60 * 5,
    type: "application/zip"
  })

  res.json({
    url,
    key
  })
})

app.post("/ai/training", authMiddleware, async (req, res) => {
  const parsedBody = TrainModel.safeParse(req.body)
  console.log("Received training request:", req.body);
  console.log("Headers:", req.headers);
    console.log("Parse result:", parsedBody);
  console.log("User ID:", req.userId);
  console.log(req.userId);
  if (!parsedBody.success) {
    res.status(411).json({
      message: "Input incorrect"
    })
    return
  }

  const { request_id, response_url } = await falAiModel.trainModel(parsedBody.data.zipUrl, parsedBody.data.name);

  const data = await prismaClient.model.create({
    data: {
      name: parsedBody.data.name,
      type: parsedBody.data.type,
      age: parsedBody.data.age,
      ethinicity: parsedBody.data.ethinicity,
      eyeColor: parsedBody.data.eyeColor,
      bald: parsedBody.data.bald,
      userId: req.userId!,
      zipUrl: parsedBody.data.zipUrl,
      falAiRequestId: request_id,
    }
  })

  res.json({
    modelId: data.id
  })
})

app.post("/ai/generate", authMiddleware, async (req, res) => {
    const parsedBody = GenerateImage.safeParse(req.body)
    console.log("Received generate request:", req.body);
    if (!parsedBody.success) {
        res.status(411).json({
            
        })
        return;
    }

    const model = await prismaClient.model.findUnique({
        where: {
            id: parsedBody.data.modelId
        }
    })
    console.log("Fetched model:", model);
    console.log("Model ID:", parsedBody.data.modelId);
    if (!model || !model.tensorPath) {
        res.status(411).json({
            message: "Model not found"
        })
        return;
    }

    console.log("ji there")
    const {request_id, response_url} = await falAiModel.generateImage(parsedBody.data.prompt, model.tensorPath);

    const data = await prismaClient.outputImages.create({
        data: {
            prompt: parsedBody.data.prompt,
            userId: req.userId!,
            modelId: parsedBody.data.modelId,
            imageUrl: "",
            falAiRequestId: request_id
        }
    })

    res.json({
        imageId: data.id
    })
})

app.post("/pack/generate", authMiddleware, async (req, res): Promise<void> => {
  const parsedBody = GenerateImagesFromPack.safeParse(req.body);
  console.log("Received pack generation request:", req.body);

  if (!parsedBody.success) {
    res.status(411).json({
      message: "Input incorrect"
    });
    return;
  }

  const prompts = await prismaClient.packPrompts.findMany({
    where: {
      packId: parsedBody.data.packId
    }
  });

  const model = await prismaClient.model.findFirst({
    where: {
      id: parsedBody.data.modelId
    }
  });

  if (!model) {
    res.status(411).json({
      message: "Model not found"
    });
    return;
  }

  let requestIds = await Promise.all(
    prompts.map((prompt) =>
      falAiModel.generateImage(prompt.prompt, model.tensorPath!)
    )
  );

  const images = await prismaClient.outputImages.createManyAndReturn({
    data: prompts.map((prompt, index) => ({
      prompt: prompt.prompt,
      userId: req.userId!,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
      falAiRequestId: requestIds[index].request_id
    }))
  });

  res.json({
    images: images.map((image) => image.id)
  });
});


app.post("/pack/create", authMiddleware, async (req, res) => {
  try {
    const { name, description, imageUrl1, imageUrl2, prompts } = req.body;

    const pack = await prismaClient.packs.create({
      data: {
        name,
        description,
        imageUrl1,
        imageUrl2,
        prompts: {
          createMany: {
            data: prompts.map((prompt: string) => ({ prompt })),
          },
        },
      },
      include: { prompts: true },
    });

    res.json({ pack });
  } catch (error) {
    console.error("Pack creation error:", error);
    res.status(500).json({ message: "Failed to create pack" });
  }
});


app.get("/pack/bulk", async (req, res) => {
  try {
    // Ensure packs are being fetched from the database
    const packs = await prismaClient.packs.findMany();

    if (!packs) {
      return res.status(404).json({ message: "No packs found." });
    }

    res.json({
      packs
    });
  } catch (error) {
    console.error("Error fetching packs:", error);
    res.status(500).json({
      message: "Internal Server Error"
    });
  }
});



app.get("/image/bulk", authMiddleware, async (req, res) => {
  const ids = req.query.ids as string[]
  const limit = req.query.limit as string ?? "100";
  const offset = req.query.offset as string ?? "0";

  const imagesData = await prismaClient.outputImages.findMany({
    where: {
      id: { in: ids }, 
      userId: req.userId!,
      status: {
        not: "Failed"
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    skip: parseInt(offset),
    take: parseInt(limit)
  })

  res.json({
    images: imagesData
  })
})

app.get("/models", authMiddleware, async(req, res) => {
  const models = await prismaClient.model.findMany({
    where: {
      OR: [{ userId: req.userId }, { open: true }]
    }
  })

  res.json({
    models
  })
})

app.post("/fal-ai/webhook/train", async (req, res) => {
  const requestId = req.body.request_id;
  const status = req.body.status;

  if (!requestId) {
    console.error("Missing request_id in webhook body");
    return res.status(400).json({ message: "Missing request_id" });
  }

  // If training isn't completed, mark as Pending
  if (status !== "COMPLETED" && status !== "OK") {
    console.log("Status is not COMPLETED/OK, marking as Pending");
    await prismaClient.model.updateMany({
      where: { falAiRequestId: requestId },
      data: { trainingStatus: "Pending" },
    });

    return res.json({ message: "Training still pending" });
  }

  let loraUrl: string | undefined;

  try {
    // Use payload directly if available
    if (req.body.payload?.diffusers_lora_file?.url) {
      loraUrl = req.body.payload.diffusers_lora_file.url;
      console.log("Using lora URL from webhook payload:", loraUrl);
    } else {
      console.log("Fetching result from fal.ai");
      const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
        requestId,
      });

      loraUrl = result.data?.diffusers_lora_file?.url;
      if (!loraUrl) {
        throw new Error("Missing diffusers_lora_file.url in fal.ai result");
      }

      console.log("Fetched lora URL:", loraUrl);
    }

    // Generate preview image from LoRA model
    const { imageUrl } = await falAiModel.generateImageSync(loraUrl as string);
    console.log("Generated preview image:", imageUrl);

    // Update model entry
    await prismaClient.model.updateMany({
      where: {
        falAiRequestId: requestId,
      },
      data: {
        trainingStatus: "Generated",
        tensorPath: loraUrl,
        thumbnail: imageUrl,
      },
    });

    res.json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Error in processing webhook:", error);

    await prismaClient.model.updateMany({
      where: { falAiRequestId: requestId },
      data: { trainingStatus: "Failed" },
    });

    res.status(500).json({
      message: "Webhook processing failed",
    });
  }
});



app.post("/fal-ai/webhook/image", async (req, res) => {
  const requestId = req.body.request_id;
  console.log("Received request_id:", requestId);

  if (!requestId) {
    return res.status(400).json({ message: "Missing request_id" });
  }

  const imageUrl = req.body?.payload?.images?.[0]?.url;

  if (req.body.status === "ERROR") {
    console.warn("Fal AI returned ERROR status");

    await prismaClient.outputImages.updateMany({
      where: {
        falAiRequestId: requestId
      },
      data: {
        status: "Failed",
        imageUrl: imageUrl ?? null 
      }
    });

    return res.status(200).json({ message: "Webhook received with ERROR status" });
  }

  if (!imageUrl) {
    console.error("Image URL missing in payload");
    return res.status(400).json({ message: "Missing image URL in payload" });
  }

  await prismaClient.outputImages.updateMany({
    where: {
      falAiRequestId: requestId
    },
    data: {
      status: "Generated",
      imageUrl
    }
  });

  res.json({
    message: "Webhook received and processed successfully"
  });
});


app.get("/", (req, res) => {  
  console.log("Root endpoint accessed");
  console.log("Request headers:", req.headers);
  
  try {
    res.json({
      message: "Hello from the backend!"
    });
    console.log("Response sent successfully");
  } catch (error) {
    console.error("Error sending response:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
