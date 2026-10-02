// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const sessions=sqliteTable('sessions',{tokenHash:text('token_hash').primaryKey(),owner:text('owner').notNull(),created:text('created').notNull()});
export const profiles=sqliteTable('profiles',{id:text('id').primaryKey(),owner:text('owner').notNull().unique(),name:text('name').notNull(),bio:text('bio').notNull().default(''),interests:text('interests').notNull().default('[]'),avatar:text('avatar').notNull().default(''),color:text('color').notNull().default('#3154F5'),created:text('created').notNull(),linkedinHandle:text('linkedin_handle').notNull().default(''),linkedinVisible:text('linkedin_visible').notNull().default('private'),instagramHandle:text('instagram_handle').notNull().default(''),instagramVisible:text('instagram_visible').notNull().default('private')});
export const rooms=sqliteTable('rooms',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),created:text('created').notNull()});
export const members=sqliteTable('members',{room:text('room').notNull().references(()=>rooms.id,{onDelete:'cascade'}),profile:text('profile').notNull().references(()=>profiles.id,{onDelete:'cascade'})},t=>[primaryKey({columns:[t.room,t.profile]})]);
export const friendships=sqliteTable('friendships',{sender:text('sender').notNull().references(()=>profiles.id,{onDelete:'cascade'}),recipient:text('recipient').notNull().references(()=>profiles.id,{onDelete:'cascade'}),status:text('status').notNull().default('pending')},t=>[primaryKey({columns:[t.sender,t.recipient]})]);

export const accounts=sqliteTable('accounts',{owner:text('owner').primaryKey(),username:text('username').notNull().unique(),signupInstagram:text('signup_instagram').notNull().default(''),signupLinkedin:text('signup_linkedin').notNull().default(''),passwordHash:text('password_hash').notNull(),created:text('created').notNull()});
export const authAttempts=sqliteTable('auth_attempts',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expires:integer('expires').notNull()});
