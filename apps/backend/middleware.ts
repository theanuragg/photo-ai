import type { NextFunction, Request, Response } from "express";
import { prismaClient } from "db";
import { clerkClient } from "@clerk/clerk-sdk-node";

export async function  authMiddleware(req: Request, res: Response, next: NextFunction) {
  
    const clerkId = req.headers.clerkid as string | undefined;
    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    
    let email = "";
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      email = clerkUser.emailAddresses[0]?.emailAddress || "";
    } catch (err) {
      console.error("Error fetching user from Clerk:", err);
      res.status(401).json({ error: "Failed to verify Clerk user" });
      return;
    }
  
    if (!email) {
      res.status(401).json({ error: "No email found for user" });
      return;
    }
  
    let user = await prismaClient.user.findUnique({
      where: {
        clerk: clerkId,
      },
    });
  
    if (!user) {
      user = await prismaClient.user.create({
        data: {
          clerk: clerkId,
          email: email,
          username: email.split("@")[0], // Use the part before "@" as the username
        },
      });
    }
    req.userId = user.id;
    next();
   

}