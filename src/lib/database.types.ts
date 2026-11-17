
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_type": string,"created_at": string,"detail": NonNullable<Json>,"id": string,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_type"?: string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_type"?: string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"child_enrollments": {
                  Row: {
                    "child_id": string,"class_id": string,"created_at": string,"fiscal_year": number,"id": string,"registration_code_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"class_id": string,"created_at"?: string,"fiscal_year": number,"id"?: string,"registration_code_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "child_id"?: string,"class_id"?: string,"created_at"?: string,"fiscal_year"?: number,"id"?: string,"registration_code_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_enrollments_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_enrollments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_enrollments_registration_code_id_fkey"
      columns: ["registration_code_id"]
isOneToOne: false
      referencedRelation: "registration_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"children": {
                  Row: {
                    "created_at": string,"full_name": string,"full_name_kana": string,"id": string,"name_key": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"full_name_kana": string,"id"?: string,"name_key"?: never,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"full_name_kana"?: string,"id"?: string,"name_key"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"classes": {
                  Row: {
                    "capacity": number,"created_at": string,"fiscal_year": number,"grade_label": string,"grade_order": number,"id": string,"name": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number,"created_at"?: string,"fiscal_year": number,"grade_label": string,"grade_order"?: number,"id"?: string,"name": string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"fiscal_year"?: number,"grade_label"?: string,"grade_order"?: number,"id"?: string,"name"?: string,"school_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"code_attempts": {
                  Row: {
                    "created_at": string,"id": string,"ip_hash": string | null,"member_id": string | null,"succeeded": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ip_hash"?: string | null,"member_id"?: string | null,"succeeded": boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ip_hash"?: string | null,"member_id"?: string | null,"succeeded"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "code_attempts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"email_messages": {
                  Row: {
                    "attempts": number,"body": string,"dedupe_key": string,"error": string | null,"event_id": string | null,"id": string,"is_marketing": boolean,"locked_until": string | null,"member_id": string | null,"order_id": string | null,"queued_at": string,"sent_at": string | null,"ses_message_id": string | null,"status": string,"subject": string,"template_key": string,"to_email": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"body": string,"dedupe_key": string,"error"?: string | null,"event_id"?: string | null,"id"?: string,"is_marketing"?: boolean,"locked_until"?: string | null,"member_id"?: string | null,"order_id"?: string | null,"queued_at"?: string,"sent_at"?: string | null,"ses_message_id"?: string | null,"status"?: string,"subject": string,"template_key": string,"to_email": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"body"?: string,"dedupe_key"?: string,"error"?: string | null,"event_id"?: string | null,"id"?: string,"is_marketing"?: boolean,"locked_until"?: string | null,"member_id"?: string | null,"order_id"?: string | null,"queued_at"?: string,"sent_at"?: string | null,"ses_message_id"?: string | null,"status"?: string,"subject"?: string,"template_key"?: string,"to_email"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_messages_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_messages_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_messages_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"email_templates": {
                  Row: {
                    "body": string,"is_marketing": boolean,"key": string,"subject": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"is_marketing"?: boolean,"key": string,"subject": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"is_marketing"?: boolean,"key"?: string,"subject"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"event_deadline_changes": {
                  Row: {
                    "changed_by": string | null,"created_at": string,"event_id": string,"id": string,"new_deadline_at": string,"notify": boolean,"old_deadline_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"created_at"?: string,"event_id": string,"id"?: string,"new_deadline_at": string,"notify"?: boolean,"old_deadline_at": string
                  }
                  Update: {
                    "changed_by"?: string | null,"created_at"?: string,"event_id"?: string,"id"?: string,"new_deadline_at"?: string,"notify"?: boolean,"old_deadline_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_deadline_changes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_targets": {
                  Row: {
                    "class_id": string,"event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"event_id": string
                  }
                  Update: {
                    "class_id"?: string,"event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_targets_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_targets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "canceled_at": string | null,"contents": string | null,"created_at": string,"deadline_at": string,"delivery_method": string,"delivery_note": string | null,"fiscal_year": number,"held_on": string | null,"id": string,"jacket_image_path": string | null,"late_delivery_note": string | null,"late_enabled": boolean,"late_production_fixed_at": string | null,"late_until": string | null,"name": string,"production_fixed_at": string | null,"sale_start_notified_at": string | null,"sale_starts_at": string,"school_id": string,"shipping_fee": number | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_at"?: string | null,"contents"?: string | null,"created_at"?: string,"deadline_at": string,"delivery_method": string,"delivery_note"?: string | null,"fiscal_year": number,"held_on"?: string | null,"id"?: string,"jacket_image_path"?: string | null,"late_delivery_note"?: string | null,"late_enabled"?: boolean,"late_production_fixed_at"?: string | null,"late_until"?: string | null,"name": string,"production_fixed_at"?: string | null,"sale_start_notified_at"?: string | null,"sale_starts_at": string,"school_id": string,"shipping_fee"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "canceled_at"?: string | null,"contents"?: string | null,"created_at"?: string,"deadline_at"?: string,"delivery_method"?: string,"delivery_note"?: string | null,"fiscal_year"?: number,"held_on"?: string | null,"id"?: string,"jacket_image_path"?: string | null,"late_delivery_note"?: string | null,"late_enabled"?: boolean,"late_production_fixed_at"?: string | null,"late_until"?: string | null,"name"?: string,"production_fixed_at"?: string | null,"sale_start_notified_at"?: string | null,"sale_starts_at"?: string,"school_id"?: string,"shipping_fee"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"job_locks": {
                  Row: {
                    "holder": string | null,"last_error": string | null,"last_finished_at": string | null,"last_started_at": string | null,"locked_until": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "holder"?: string | null,"last_error"?: string | null,"last_finished_at"?: string | null,"last_started_at"?: string | null,"locked_until"?: string,"name": string
                  }
                  Update: {
                    "holder"?: string | null,"last_error"?: string | null,"last_finished_at"?: string | null,"last_started_at"?: string | null,"locked_until"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"marketing_consents": {
                  Row: {
                    "action": string,"created_at": string,"id": string,"member_id": string,"source": string,"wording_version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: string,"member_id": string,"source": string,"wording_version"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: string,"member_id"?: string,"source"?: string,"wording_version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_consents_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"member_children": {
                  Row: {
                    "child_id": string,"fiscal_year": number,"id": string,"linked_at": string,"member_id": string,"registration_code_id": string | null,"revoked_at": string | null,"revoked_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"fiscal_year": number,"id"?: string,"linked_at"?: string,"member_id": string,"registration_code_id"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null
                  }
                  Update: {
                    "child_id"?: string,"fiscal_year"?: number,"id"?: string,"linked_at"?: string,"member_id"?: string,"registration_code_id"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_children_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_children_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_children_registration_code_id_fkey"
      columns: ["registration_code_id"]
isOneToOne: false
      referencedRelation: "registration_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "address": string | null,"created_at": string,"email": string,"email_status": string,"email_status_at": string | null,"full_name": string,"full_name_kana": string,"id": string,"marketing_opt_in": boolean,"phone": string | null,"postal_code": string | null,"stripe_customer_id": string | null,"updated_at": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"email": string,"email_status"?: string,"email_status_at"?: string | null,"full_name": string,"full_name_kana": string,"id": string,"marketing_opt_in"?: boolean,"phone"?: string | null,"postal_code"?: string | null,"stripe_customer_id"?: string | null,"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"email"?: string,"email_status"?: string,"email_status_at"?: string | null,"full_name"?: string,"full_name_kana"?: string,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string | null,"postal_code"?: string | null,"stripe_customer_id"?: string | null,"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "amount": number,"canceled_amount": number | null,"canceled_at": string | null,"child_id": string,"class_id": string,"class_name_snapshot": string,"created_at": string,"exchange_note": string | null,"exchange_shipped_at": string | null,"fulfillment_status": string | null,"grade_label_snapshot": string,"id": string,"late_price_snapshot": number | null,"line_no": number,"order_id": string,"photo_id": string | null,"price_snapshot": number,"product_id": string,"product_name_snapshot": string,"quantity": number,"second_price_snapshot": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"canceled_amount"?: number | null,"canceled_at"?: string | null,"child_id": string,"class_id": string,"class_name_snapshot": string,"created_at"?: string,"exchange_note"?: string | null,"exchange_shipped_at"?: string | null,"fulfillment_status"?: string | null,"grade_label_snapshot": string,"id"?: string,"late_price_snapshot"?: number | null,"line_no": number,"order_id": string,"photo_id"?: string | null,"price_snapshot": number,"product_id": string,"product_name_snapshot": string,"quantity": number,"second_price_snapshot"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"canceled_amount"?: number | null,"canceled_at"?: string | null,"child_id"?: string,"class_id"?: string,"class_name_snapshot"?: string,"created_at"?: string,"exchange_note"?: string | null,"exchange_shipped_at"?: string | null,"fulfillment_status"?: string | null,"grade_label_snapshot"?: string,"id"?: string,"late_price_snapshot"?: number | null,"line_no"?: number,"order_id"?: string,"photo_id"?: string | null,"price_snapshot"?: number,"product_id"?: string,"product_name_snapshot"?: string,"quantity"?: number,"second_price_snapshot"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_received": number,"buyer_email": string | null,"buyer_kana": string | null,"buyer_name": string | null,"buyer_phone": string | null,"cancel_reason": string | null,"canceled_at": string | null,"channel": string,"created_at": string,"created_by": string | null,"delivery_method": string,"event_id": string,"id": string,"is_late": boolean,"member_id": string | null,"memo": string | null,"needs_attention": string | null,"order_no": string,"paid_amount": number | null,"paid_at": string | null,"payment_details": Json | null,"payment_due_at": string | null,"payment_method": string,"payment_status": string,"ship_address": string | null,"ship_name": string | null,"ship_phone": string | null,"ship_postal_code": string | null,"shipping_fee": number,"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"subtotal": number,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_received"?: number,"buyer_email"?: string | null,"buyer_kana"?: string | null,"buyer_name"?: string | null,"buyer_phone"?: string | null,"cancel_reason"?: string | null,"canceled_at"?: string | null,"channel": string,"created_at"?: string,"created_by"?: string | null,"delivery_method": string,"event_id": string,"id"?: string,"is_late"?: boolean,"member_id"?: string | null,"memo"?: string | null,"needs_attention"?: string | null,"order_no"?: string,"paid_amount"?: number | null,"paid_at"?: string | null,"payment_details"?: Json | null,"payment_due_at"?: string | null,"payment_method": string,"payment_status"?: string,"ship_address"?: string | null,"ship_name"?: string | null,"ship_phone"?: string | null,"ship_postal_code"?: string | null,"shipping_fee"?: number,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal": number,"total": number,"updated_at"?: string
                  }
                  Update: {
                    "amount_received"?: number,"buyer_email"?: string | null,"buyer_kana"?: string | null,"buyer_name"?: string | null,"buyer_phone"?: string | null,"cancel_reason"?: string | null,"canceled_at"?: string | null,"channel"?: string,"created_at"?: string,"created_by"?: string | null,"delivery_method"?: string,"event_id"?: string,"id"?: string,"is_late"?: boolean,"member_id"?: string | null,"memo"?: string | null,"needs_attention"?: string | null,"order_no"?: string,"paid_amount"?: number | null,"paid_at"?: string | null,"payment_details"?: Json | null,"payment_due_at"?: string | null,"payment_method"?: string,"payment_status"?: string,"ship_address"?: string | null,"ship_name"?: string | null,"ship_phone"?: string | null,"ship_postal_code"?: string | null,"shipping_fee"?: number,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal"?: number,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"product_targets": {
                  Row: {
                    "class_id": string,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"product_id": string
                  }
                  Update: {
                    "class_id"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_targets_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_targets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "canceled_at": string | null,"created_at": string,"event_id": string,"id": string,"kind": string,"late_price": number | null,"media": string,"name": string,"price": number,"second_price": number | null,"sort_order": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_at"?: string | null,"created_at"?: string,"event_id": string,"id"?: string,"kind": string,"late_price"?: number | null,"media": string,"name": string,"price": number,"second_price"?: number | null,"sort_order"?: number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "canceled_at"?: string | null,"created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: string,"late_price"?: number | null,"media"?: string,"name"?: string,"price"?: number,"second_price"?: number | null,"sort_order"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"failure_reason": string | null,"id": string,"item_ids": (string)[],"method": string,"order_id": string,"reason": string,"status": string,"stripe_refund_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"failure_reason"?: string | null,"id"?: string,"item_ids"?: (string)[],"method": string,"order_id": string,"reason": string,"status"?: string,"stripe_refund_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"failure_reason"?: string | null,"id"?: string,"item_ids"?: (string)[],"method"?: string,"order_id"?: string,"reason"?: string,"status"?: string,"stripe_refund_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"registration_codes": {
                  Row: {
                    "child_id": string | null,"class_id": string,"code": string,"created_at": string,"id": string,"issued_at": string,"purpose": string,"replaced_by": string | null,"revoked_at": string | null,"serial_no": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id"?: string | null,"class_id": string,"code": string,"created_at"?: string,"id"?: string,"issued_at"?: string,"purpose"?: string,"replaced_by"?: string | null,"revoked_at"?: string | null,"serial_no"?: number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "child_id"?: string | null,"class_id"?: string,"code"?: string,"created_at"?: string,"id"?: string,"issued_at"?: string,"purpose"?: string,"replaced_by"?: string | null,"revoked_at"?: string | null,"serial_no"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registration_codes_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registration_codes_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registration_codes_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "registration_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"schools": {
                  Row: {
                    "address": string | null,"created_at": string,"id": string,"kind": string,"memo": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"memo"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"memo"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "is_public": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "is_public"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "is_public"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"shipments": {
                  Row: {
                    "carrier": string | null,"created_at": string,"id": string,"kind": string,"order_id": string,"shipped_at": string,"tracking_no": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"order_id": string,"shipped_at"?: string,"tracking_no"?: string | null
                  }
                  Update: {
                    "carrier"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"order_id"?: string,"shipped_at"?: string,"tracking_no"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string,"name": string,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email": string,"name": string,"role": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string,"name"?: string,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_events": {
                  Row: {
                    "attempts": number,"error": string | null,"id": string,"object_id": string | null,"processed_at": string | null,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"error"?: string | null,"id": string,"object_id"?: string | null,"processed_at"?: string | null,"received_at"?: string,"type": string
                  }
                  Update: {
                    "attempts"?: number,"error"?: string | null,"id"?: string,"object_id"?: string | null,"processed_at"?: string | null,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "acquire_job_lock":
{ Args: { "p_holder": string,"p_name": string,"p_ttl": string }; Returns: boolean
                           },
"apply_paid_cancellation":
{ Args: { "p_actor": string,"p_expected_total": number,"p_item_ids": (string)[],"p_lines": Json,"p_method": string,"p_order_id": string,"p_reason": string,"p_shipping_fee": number,"p_subtotal": number }; Returns: string
                           },
"can_read_event":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"can_view_event":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"cancel_unpaid_order":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: boolean
                           },
"claim_email_batch":
{ Args: { "p_lease"?: string,"p_limit": number }; Returns: {
              "attempts": number,
"body": string,
"dedupe_key": string,
"error": string | null,
"event_id": string | null,
"id": string,
"is_marketing": boolean,
"locked_until": string | null,
"member_id": string | null,
"order_id": string | null,
"queued_at": string,
"sent_at": string | null,
"ses_message_id": string | null,
"status": string,
"subject": string,
"template_key": string,
"to_email": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "email_messages"
        isOneToOne: false
        isSetofReturn: true
      } },
"copy_classes":
{ Args: { "p_from_year": number,"p_school_id": string,"p_to_year": number }; Returns: number
                           },
"create_order":
{ Args: { "p_items": Json,"p_order": Json }; Returns: {
              "order_id": string,"order_no": string
            }[]
                           },
"delete_draft_order":
{ Args: { "p_order_id": string }; Returns: boolean
                           },
"event_audience":
{ Args: { "p_event_id": string,"p_unordered_only": boolean }; Returns: {
              "child_names": (string)[],"email": string,"full_name": string,"member_id": string,"unordered_child_names": (string)[]
            }[]
                           },
"fix_production_counts":
{ Args: { "p_now"?: string }; Returns: {
              "event_id": string,"kind": string
            }[]
                           },
"has_order_for_event":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"is_my_child":
{ Args: { "p_child_id": string }; Returns: boolean
                           },
"is_my_child_year":
{ Args: { "p_child_id": string,"p_fiscal_year": number }; Returns: boolean
                           },
"is_my_class":
{ Args: { "p_class_id": string }; Returns: boolean
                           },
"is_my_order":
{ Args: { "p_order_id": string }; Returns: boolean
                           },
"is_my_school":
{ Args: { "p_school_id": string }; Returns: boolean
                           },
"jst_date":
{ Args: { "p": string }; Returns: string
                           },
"jst_end_of_day":
{ Args: { "p": string }; Returns: string
                           },
"kana_name_key":
{ Args: { "p": string }; Returns: string
                           },
"mark_order_paid":
{ Args: { "p_from": (string)[],"p_order_id": string,"p_paid_at"?: string,"p_payment_intent_id"?: string }; Returns: boolean
                           },
"mark_order_pending":
{ Args: { "p_details": Json,"p_order_id": string,"p_payment_intent_id": string }; Returns: boolean
                           },
"register_code":
{ Args: { "p_code": string,"p_full_name": string,"p_full_name_kana": string,"p_ip_hash": string,"p_max_accounts": number,"p_max_failures"?: number,"p_member_id": string,"p_target_child_id": string,"p_window"?: string }; Returns: Json
                           },
"reissue_code":
{ Args: { "p_code_id": string,"p_new_code": string }; Returns: string
                           },
"release_job_lock":
{ Args: { "p_error"?: string,"p_holder": string,"p_name": string }; Returns: undefined
                           },
"resolve_proxy_child":
{ Args: { "p_class_id": string,"p_full_name": string,"p_full_name_kana": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
