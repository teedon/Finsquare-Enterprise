export type FormFieldType =
  | "short_text" | "long_text" | "number" | "currency" | "date" | "dropdown"
  | "radio" | "checkboxes" | "yes_no" | "phone" | "email" | "address" | "file"

export interface FormOption { id: string; label: string }

export interface DocumentRequirement {
  name: string
  description?: string
  required: boolean
  fileTypes: string[]
  maxSizeMb: number
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  description?: string
  required: boolean
  options?: FormOption[]
  questionLibraryId?: string
  systemField?: string
  /** System fields the workflow depends on: cannot be deleted or made optional. */
  locked?: boolean
  documentConfig?: DocumentRequirement
  order: number
}

export type FormStepKind = "personal" | "loan" | "custom" | "documents" | "guarantors" | "review"

export interface FormStep {
  id: string
  title: string
  description?: string
  order: number
  type: "system" | "custom"
  kind: FormStepKind
  fields: FormField[]
}

export type FormStatus = "Draft" | "Published" | "Archived"

export interface FormVersion {
  id: string
  version: number
  status: FormStatus
  steps: FormStep[]
  createdAt: string
  publishedAt?: string
}

export type ApplicationType = "Internal" | "External" | "Both"

/**
 * The part of a form container the builder cares about. Both the loan application form and
 * the member application form satisfy it, so the version helpers can be shared between them.
 */
export interface VersionedForm {
  status: FormStatus
  versions: FormVersion[]
  publishedVersionId?: string
}

export interface QuestionLibraryItem {
  id: string
  label: string
  type: FormFieldType
  category: string
  description?: string
  required: boolean
  options?: FormOption[]
  createdAt: string
  archived: boolean
}

export interface UploadedFile {
  fileName: string
  uploadedAt: string
  url?: string
  fileUrl?: string
  downloadUrl?: string
  mimeType?: string
}
export type FormResponseValue = string | number | boolean | string[] | UploadedFile
